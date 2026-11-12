// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
(function () {
    'use strict';
    const CHECK_TIMEOUT_MS = 10000;
    const ACTIVATE_TIMEOUT_MS = 8000;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // La versión publicada, leída de la red (no de la caché). Lanza si no hay conexión. No se decide con los eventos del
    // service worker (updatefound/controllerchange): en iOS tardan o no llegan y el botón quedaría girando sin decir nada.
    async function publishedVersion(versionUrl, versionVar) {
        if (navigator.onLine === false) throw new Error('sin conexión');
        const response = await Promise.race([
            fetch(`${versionUrl}?t=${Date.now()}`, { cache: 'no-store' }),
            wait(CHECK_TIMEOUT_MS).then(() => { throw new Error('sin respuesta'); }),
        ]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const match = new RegExp(`${versionVar}\\s*=\\s*['"]([^'"]+)['"]`).exec(await response.text());
        return match ? match[1] : null;
    }

    // Deja activo el service worker nuevo antes de recargar; si no responde a tiempo se recarga igual (el shell va primero por la red).
    async function activateNewWorker() {
        try {
            const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
            if (!registration) return;
            let changed = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => { changed = true; }, { once: true });
            await Promise.race([registration.update(), wait(ACTIVATE_TIMEOUT_MS)]);
            const started = Date.now();
            while (!changed && (registration.installing || registration.waiting) && Date.now() - started < ACTIVATE_TIMEOUT_MS) await wait(100);
        } catch (error) { /* se recarga de todos modos */ }
    }

    window.AppUpdate = {
        /** Recarga la página; sustituible en pruebas. */
        reload: () => location.reload(),

        init({ versionUrl = 'version.js', versionVar = 'APP_VERSION' } = {}) {
            const row = document.getElementById('update-row');
            const button = document.getElementById('btn-update');
            const text = document.getElementById('update-text');
            if (!row || !button || !text) return;
            const label = text.textContent; // lo que dice la fila en reposo
            let busy = false;
            const show = (state, message) => { row.dataset.state = state; text.textContent = message || label; };

            button.addEventListener('click', async () => {
                if (busy) return;
                busy = true;
                button.disabled = true;
                show('busy', 'Buscando…');
                try {
                    const current = self[versionVar];
                    const published = await publishedVersion(versionUrl, versionVar);
                    if (published && current && published !== current) {
                        show('busy', `Actualizando a v${published}…`);
                        await activateNewWorker();
                        window.AppUpdate.reload();
                        return;
                    }
                    show('done', current ? `Al día · v${current}` : 'Al día');
                } catch (error) {
                    show('done', 'Sin conexión');
                }
                busy = false;
                button.disabled = false;
            });
        },
    };
})();
