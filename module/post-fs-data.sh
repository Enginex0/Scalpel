#!/system/bin/sh
# shellcheck shell=bash disable=SC3043,SC1090
MODDIR="${0%/*}"

# Clear the post-boot flag so service.sh/boot-completed.sh can claim it fresh
rm -f "/data/adb/scalpel/boot_completed_handled" 2>/dev/null

# 3-strike bootloop protection -- must run before anything else
. "${MODDIR}/core/bootloop.sh"
bootloop_init
bootloop_check || exit 0

# Config first so SCALPEL_MODE_OVERRIDE and SCALPEL_LOG_LEVEL are available
. "${MODDIR}/core/config.sh"
config_init 2>/dev/null || echo "scalpel[post-fs-data]: config_init failed (continuing)" > /dev/kmsg

. "${MODDIR}/core/logging.sh"
log_init

TAG="post-fs-data"
log_i "$TAG" "scalpel starting (boot)"

# Debloat engine -- sources detect.sh + mode scripts internally
. "${MODDIR}/core/nuke.sh"
nuke_run || log_w "post-fs-data" "nuke completed with failures"

# ZeroMount VFS can't handle readdir() -- tmpfs+bind gives PMS a merged directory view
_mount_systemized_apps() {
    local _tag="systemize-mount"
    local _sys_list="/data/adb/scalpel/systemize_list.json"

    [ ! -f "$_sys_list" ] && return 0

    local _jq_bin="${MODDIR}/bin/jq"
    [ ! -x "$_jq_bin" ] && _jq_bin="jq"

    local _count
    _count="$("$_jq_bin" 'length' "$_sys_list" 2>/dev/null)"
    [ -z "$_count" ] || [ "$_count" = "0" ] && return 0

    log_i "$_tag" "mounting $_count systemized apps"

    local _targets
    _targets="$("$_jq_bin" -r '[.[].target] | unique | .[]' "$_sys_list" 2>/dev/null)"
    [ -z "$_targets" ] && return 0

    local target sys_dir mount_point context mount_opts
    for target in $_targets; do
        case "$target" in app|priv-app) ;; *) continue ;; esac

        sys_dir="/system/${target}"
        [ ! -d "$sys_dir" ] && { log_w "$_tag" "$sys_dir does not exist"; continue; }

        mount_point="/dev/scalpel_mount_${target}"

        # PMS rejects dirs with wrong SELinux context
        context=$(ls -Zd "$sys_dir" 2>/dev/null | awk '{print $1}')

        # Mount without context= option -- KernelSU lacks CAP_MAC_ADMIN so
        # the kernel rejects context= in mount options. Apply via chcon instead.
        mount_opts="mode=0755"

        mkdir -p "$mount_point" 2>/dev/null || { log_e "$_tag" "cannot create $mount_point"; continue; }

        if ! mount -t tmpfs -o "$mount_opts" tmpfs "$mount_point" 2>/dev/null; then
            log_e "$_tag" "tmpfs mount failed for $mount_point"
            rmdir "$mount_point" 2>/dev/null
            continue
        fi

        # Set SELinux context post-mount (chcon works without CAP_MAC_ADMIN)
        if [ -n "$context" ] && [ "$context" != "?" ]; then
            chcon "$context" "$mount_point" 2>/dev/null || \
                log_w "$_tag" "chcon failed for $mount_point (context=$context)"
        fi

        # Mirror every existing subdir so original system apps stay visible
        local existing_dir name
        for existing_dir in "$sys_dir"/*/; do
            [ -d "$existing_dir" ] || continue
            name="${existing_dir%/}"
            name="${name##*/}"
            mkdir -p "${mount_point}/${name}" 2>/dev/null
            mount --bind "$existing_dir" "${mount_point}/${name}" 2>/dev/null || \
                log_w "$_tag" "bind-mount failed for existing $name"
        done

        # Add each promoted app from the module directory
        local sys_path app_dir dir_name
        while IFS= read -r sys_path; do
            [ -z "$sys_path" ] && continue
            app_dir="${sys_path%/*}"
            [ ! -d "$app_dir" ] && continue
            dir_name="${app_dir##*/}"
            mkdir -p "${mount_point}/${dir_name}" 2>/dev/null
            mount --bind "$app_dir" "${mount_point}/${dir_name}" 2>/dev/null || \
                log_w "$_tag" "bind-mount failed for promoted $dir_name"
        done <<SYSEOF
$("$_jq_bin" -r ".[] | select(.target == \"$target\") | .system_path" "$_sys_list" 2>/dev/null)
SYSEOF

        # Overlay the real /system/{target} with merged tmpfs
        if mount --bind "$mount_point" "$sys_dir" 2>/dev/null; then
            log_i "$_tag" "mounted $sys_dir (merged view)"
        else
            log_e "$_tag" "final bind-mount failed for $sys_dir"
            umount "$mount_point" 2>/dev/null
        fi
    done

    # Permissions XMLs needed for priv-app promotions (Android 9+)
    local _has_privapp
    _has_privapp="$("$_jq_bin" -r '[.[] | select(.target == "priv-app")] | length' "$_sys_list" 2>/dev/null)"
    if [ -n "$_has_privapp" ] && [ "$_has_privapp" -gt 0 ] 2>/dev/null; then
        local perm_dir="/system/etc/permissions"
        local perm_mount="/dev/scalpel_mount_perms"
        local perm_ctx

        if [ -d "$perm_dir" ]; then
            perm_ctx=$(ls -Zd "$perm_dir" 2>/dev/null | awk '{print $1}')
            local perm_opts="mode=0755"

            mkdir -p "$perm_mount" 2>/dev/null
            if mount -t tmpfs -o "$perm_opts" tmpfs "$perm_mount" 2>/dev/null; then
                # Apply SELinux context post-mount (same CAP_MAC_ADMIN workaround)
                if [ -n "$perm_ctx" ] && [ "$perm_ctx" != "?" ]; then
                    chcon "$perm_ctx" "$perm_mount" 2>/dev/null || \
                        log_w "$_tag" "chcon failed for $perm_mount (context=$perm_ctx)"
                fi
                # Copy all existing permission files
                cp -a "$perm_dir"/* "$perm_mount"/ 2>/dev/null
                # Ensure correct SELinux labels if cp -a failed to preserve xattrs
                chcon -R "$perm_ctx" "$perm_mount"/ 2>/dev/null

                # Overlay with Scalpel's generated permission XMLs
                local mod_perm_dir="${MODDIR}/system/etc/permissions"
                if [ -d "$mod_perm_dir" ]; then
                    cp -a "$mod_perm_dir"/privapp-permissions-*.xml "$perm_mount"/ 2>/dev/null
                fi

                if mount --bind "$perm_mount" "$perm_dir" 2>/dev/null; then
                    log_i "$_tag" "mounted $perm_dir (merged permissions)"
                else
                    log_e "$_tag" "final bind-mount failed for $perm_dir"
                    umount "$perm_mount" 2>/dev/null
                fi
            else
                log_e "$_tag" "tmpfs mount failed for $perm_mount"
                rmdir "$perm_mount" 2>/dev/null
            fi
        fi
    fi
}

_mount_systemized_apps || log_w "$TAG" "systemize mount had failures"

log_i "$TAG" "post-fs-data complete"
