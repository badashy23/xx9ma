// ==UserScript==
// @name         XXTwitch - Force desired quality, unmute, exit fullscreen (with persistence)
// @namespace    @USER
// @version      1.18.9
// @description  Forces Twitch stream to chosen quality, unmutes, exits fullscreen, tricks visibility API, and persists quality choice in localStorage
// @author       @USER
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://player.twitch.tv/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

const doOnlySetting = false;
const STORAGE_KEY = 'twitchDesiredQuality';
const TIMESTAMP_KEY = 's-qs-ts';
const QUALITY_KEY = 'video-quality';

(function () {
    'use strict';

    if (!doOnlySetting) {
        Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });
        Object.defineProperty(document, 'webkitVisibilityState', { value: 'visible', writable: false });
        document.hasFocus = () => true;

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

    window.addEventListener('popstate', () => {
        setQualitySettings(localStorage.getItem(STORAGE_KEY));
        cleanupWatcher();

        const core = findCore();
        if (core) {
            if (core.isMuted?.()) {
                core.setMuted(false);
                const newVol = +(Math.random() * 0.8 + 0.1).toFixed(2);
                core.setVolume(newVol);
                console.log(`[TwitchScript] Desmutado (popstate) com volume ${newVol}`);
            }

            const qualities = core.getQualities?.() || [];
            if (qualities.length) {
                const match = qualities.find(q => q.group === stored);
                if (match) core.setQuality?.(match);
            }
        }
    });

    let desiredGroup = stored;
    let playerCore = null;
    let lastEnforce = 0;
    let ready = false;
    let bufferingWatcherStarted = false;

    let watcherInterval = null;
    let watcherActive = true;
    let originalTitle = document.title;

    let timeoutId = null;
    let userPresenceButton = null;

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
            const state = playerCore?.state?.state || playerCore?._state?.machine?._currentState;
            const problematicStates = ['Buffering', 'Ready', 'Idle'];

            if (problematicStates.includes(state) && !bufferingWatcherStarted) {
                startBufferingWatcher(playerCore);
                bufferingWatcherStarted = true;
            }

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

            if (playerCore.isMuted?.()) {
                playerCore.setMuted(false);
                const newVol = +(Math.random() * 0.8 + 0.1).toFixed(2);
                playerCore.setVolume(newVol);
                console.log(`[TwitchScript] Desmutado (enforce) com volume ${newVol}`);
            }

            if (playerCore.isPaused?.()) playerCore.play?.();
        } catch (e) {
            console.error('[TwitchScript] enforce error', e);
        }

        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    function attachListeners(core) {
        ['PlayerMutedChanged', 'Playing', 'Idle'].forEach(evt => core.addEventListener(evt, enforceSettings));
    }

    function findCore() {
        const cont = document.querySelector('.video-player__container, .video-player');
        if (!cont) return null;
        const key = Object.keys(cont).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
        if (!key) return null;

        let node = cont[key];
        for (let i = 0; node && i < 50; i++) {
            if (node.memoizedProps?.mediaPlayerInstance?.core) {
                return node.memoizedProps.mediaPlayerInstance.core;
            }
            node = node.return;
        }
        return null;
    }

    function startBufferingWatcher(core) {
        let problemSince = 0;
        let crashHandled = false;
        originalTitle = document.title;
        watcherActive = true;

        function showUserPresenceButton(onConfirm, timeout = 60000) {
            if (userPresenceButton) return;

            watcherActive = false;

            const btn = document.createElement('button');
            btn.id = 'twitch-user-confirm';
            btn.innerText = 'Estou aqui!';
            Object.assign(btn.style, {
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                zIndex: 99999,
                padding: '10px 20px',
                fontSize: '16px',
                backgroundColor: '#9146FF',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            });

            document.body.appendChild(btn);
            userPresenceButton = btn;

            clearInterval(watcherInterval);

            timeoutId = setTimeout(() => {
                cleanupWatcher();
                location.reload();
            }, timeout);

            btn.addEventListener('click', () => {
                clearTimeout(timeoutId);
                timeoutId = null;
                cleanupWatcher();

                try {
                    core.pause?.();
                    if (core.isMuted?.()) {
                        core.setMuted(false);
                        const newVol = +(Math.random() * 0.8 + 0.1).toFixed(2);
                        core.setVolume(newVol);
                        console.log(`[TwitchScript] Desmutado (user click) com volume ${newVol}`);
                    }
                    setTimeout(() => {
                        core.play?.();
                        removeCrashedTitle();
                    }, 500);
                } catch (e) {
                    console.warn('[TwitchScript] Erro ao tentar reiniciar o player após foco:', e);
                }
            });
        }

        watcherInterval = setInterval(() => {
            if (!watcherActive) return;

            const state = core?.state?.state || core?._state?.machine?._currentState;

            if (['Buffering', 'Ready', 'Idle'].includes(state)) {
                if (!problemSince) problemSince = Date.now();

                const timeElapsed = Date.now() - problemSince;
                if (!crashHandled && timeElapsed >= 10000) {
                    crashHandled = true;
                    console.error(`[TwitchScript] Player problem detected (state: ${state} > 10s) – crashed`);

                    originalTitle = document.title.replace(' (crashed)', '');
                    document.title = `${originalTitle} (crashed)`;

                    showUserPresenceButton();
                }
            } else {
                problemSince = 0;
                crashHandled = false;
                removeCrashedTitle();
            }
        }, 1000);

        window.addEventListener('beforeunload', () => {
            cleanupWatcher();
        });
    }

    function removeCrashedTitle() {
        if (document.title.endsWith(' (crashed)')) {
            document.title = document.title.replace(/ \(crashed\)$/, '');
        }
    }

    function cleanupWatcher() {
        if (watcherInterval) {
            clearInterval(watcherInterval);
            watcherInterval = null;
        }
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
        if (userPresenceButton) {
            userPresenceButton.remove();
            userPresenceButton = null;
        }
        bufferingWatcherStarted = false;
        watcherActive = false;
        removeCrashedTitle();
    }

    function init() {
        setTimeout(() => {
            playerCore = findCore();
            if (playerCore) attachListeners(playerCore);
            ready = true;
            enforceSettings();
        }, 2000);
    }

    document.addEventListener('DOMContentLoaded', init);

    const poll = setInterval(() => {
        if (!playerCore) init();
        else clearInterval(poll);
    }, 2000);
})();
