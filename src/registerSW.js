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
        const hadController = Boolean(navigator.serviceWorker.controller);
        let reloadingForUpdate = false;
        if (hadController) {
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (reloadingForUpdate) return;
                reloadingForUpdate = true;
                window.location.reload();
            }, { once: true });
        }

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
