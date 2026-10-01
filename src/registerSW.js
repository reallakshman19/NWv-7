export function registerSW() {
    if (!('serviceWorker' in navigator)) {
        return;
    }

    if (!import.meta.env.PROD) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                registrations.forEach((registration) => registration.unregister());
            });
        });
        return;
    }

    window.addEventListener('load', () => {
        const swPath = './sw.js';
        navigator.serviceWorker.register(swPath, { updateViaCache: 'none' })
            .then(async (registration) => {
                console.log('SW registered: ', registration);
                try {
                    await registration.update();
                } catch (updateError) {
                    console.warn('SW update check failed: ', updateError);
                }
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}
