// ==UserScript==
// @name         XTwitch - Force desired quality, unmute, exit fullscreen (with persistence)
// @namespace    @USER
// @version      1.18.0
// @description  Forces Twitch stream to chosen quality, unmutes, exits fullscreen, tricks visibility API, and persists quality choice in localStorage
// @author       @USER
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://player.twitch.tv/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

const doOnlySetting = false;
const STORAGE_KEY   = 'twitchDesiredQuality';
const TIMESTAMP_KEY = 's-qs-ts';
const QUALITY_KEY   = 'video-quality';

(function () {
    'use strict';

    if (!doOnlySetting) {
        Object.defineProperty(document, 'visibilityState',      { value: 'visible', writable: false });
        Object.defineProperty(document, 'webkitVisibilityState', { value: 'visible', writable: false });
        // document.hasFocus = () => true; // >>> REMOVIDO
        const initialHidden = document.hidden;
        let didInitialPlay = false;
        document.addEventListener('visibilitychange', e => {
            if (!(document.hidden === false && initialHidden && !didInitialPlay)) {
                e.stopImmediatePropagation();
            }
            if (document.hidden) didInitialPlay = true;
        }, true);
    }

    function setQualitySettings(group) {
        try {
            localStorage.setItem(TIMESTAMP_KEY, Date.now());
            localStorage.setItem(QUALITY_KEY, JSON.stringify({ default: group || 'chunked' }));
        } catch (e) {
            console.error('[TwitchScript] setQualitySettings error:', e);
        }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    setQualitySettings(stored);
    window.addEventListener('popstate', () => setQualitySettings(localStorage.getItem(STORAGE_KEY)));

    let desiredGroup = stored;
    let playerCore   = null;
    let lastEnforce  = 0;
    let ready        = false;

    function simulateClick() {
        const target = document.querySelector('[data-a-target="stream-title"]');
        if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    function persistQuality(group) {
        if (!group?.includes('160p')) return;
        localStorage.setItem(STORAGE_KEY, group);
        desiredGroup = group;
        setQualitySettings(group);
    }

    function enforceSettings() {
        if (!ready || !playerCore) return;
        const now = Date.now();
        if (now - lastEnforce < 5000) return;
        lastEnforce = now;

        try {
            const qualities = playerCore.getQualities?.() || [];
            if (qualities.length) {
                const lowest = qualities[qualities.length - 1];
                let target = lowest;

                if (desiredGroup) {
                    const match = qualities.find(q => q.group === desiredGroup);
                    if (match) target = match;
                }

                const current = playerCore.getQuality?.();
                if (playerCore.isAutoQualityMode?.() || current?.group !== target.group) {
                    playerCore.setQuality?.(target);
                    persistQuality(target.group);
                }
            }

            if (playerCore.isMuted?.()) playerCore.setMuted(false);
            if (playerCore.isPaused?.()) playerCore.play?.();
        } catch (e) {
            console.error('[TwitchScript] enforce error', e);
        }

        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }

    function attachListeners(core) {
        ['PlayerMutedChanged', 'Playing', 'Idle'].forEach(evt => core.addEventListener(evt, enforceSettings));
        startBufferingWatcher(core);
    }

    function findCore() {
        const cont = document.querySelector('.video-player__container, .video-player');
        if (!cont) return null;
        const key = Object.keys(cont).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!key) return null;

        let node = cont[key];
        for (let i = 0; node && i < 50; i++) {
            if (node.memoizedProps?.mediaPlayerInstance?.core) return node.memoizedProps.mediaPlayerInstance.core;
            node = node.return;
        }
        return null;
    }

    // >>> Atualizado: monitora 'Buffering' e 'Ready' > 5s e reinicia o player com pause/play
    function startBufferingWatcher(core) {
        let problemSince = 0;
        let warned = false;
        let originalTitle = document.title;

        setInterval(() => {
            const state = core?.state?.state || core?._state?.machine?._currentState;
            if (state === 'Buffering' || state === 'Ready') {
                if (!problemSince) problemSince = Date.now();
                if (!warned && Date.now() - problemSince >= 5000) {
                    console.error(`[TwitchScript] Player problem detected (state: ${state} > 5s)`);

                    // >>> ALTERADO: salva título e marca como (muted)
                    originalTitle = document.title.replace(' (muted)', '');
                    document.title = originalTitle + ' (muted)';

                    // Espera foco real da aba
                    const waitForFocus = setInterval(() => {
                        if (document.visibilityState === 'visible' && document.hasFocus()) {
                            clearInterval(waitForFocus);

                            try {
                                core.pause?.();
                                setTimeout(() => {
                                    core.play?.();
                                    // Remove tag do título
                                    document.title = originalTitle;
                                }, 500);
                            } catch (e) {
                                console.warn('[TwitchScript] Falha ao reiniciar player após foco:', e);
                            }

                            warned = true;
                        }
                    }, 500);
                    // <<<
                }
            } else {
                problemSince = 0;
                warned = false;
                document.title = originalTitle; // limpa caso volte ao normal
            }
        }, 1000);
    }

    function init() {
        setTimeout(() => {
            simulateClick();
            playerCore = findCore();
            if (playerCore) attachListeners(playerCore);
            ready = true;
            enforceSettings();
        }, 5000);
    }

    document.addEventListener('DOMContentLoaded', init);
    const poll = setInterval(() => {
        if (!playerCore) init();
        else clearInterval(poll);
    }, 2000);
})();
