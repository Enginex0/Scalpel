use std::sync::atomic::{AtomicBool, Ordering};

static SHUTDOWN: AtomicBool = AtomicBool::new(false);

pub fn register_shutdown_handler() {
    unsafe {
        libc::signal(libc::SIGTERM, handle_signal as usize);
        libc::signal(libc::SIGINT, handle_signal as usize);
    }
}

extern "C" fn handle_signal(_sig: libc::c_int) {
    SHUTDOWN.store(true, Ordering::SeqCst);
}

pub fn shutdown_requested() -> bool {
    SHUTDOWN.load(Ordering::SeqCst)
}
