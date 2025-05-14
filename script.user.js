// ==UserScript==
// @name         Twitch - Force desired quality, unmute, exit fullscreen (with persistence)
// @namespace    @USER
// @version      1.15.0
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
            localStorage.setItem(TIMESTAMP_KEY, Math.floor(Date.now()));
            const payload = JSON.stringify({ default: group || 'chunked' });
            localStorage.setItem(QUALITY_KEY, payload);
            console.log('[TwitchScript] localStorage quality set:', payload);
        } catch (e) {
            console.error('[TwitchScript] setQualitySettings error:', e);
        }
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    setQualitySettings(stored);
    window.addEventListener('popstate', () => setQualitySettings(localStorage.getItem(STORAGE_KEY)));

    let desiredGroup = stored;
    let playerCore = null;
    let lastEnforce = 0;
    let ready = false;

    function simulateClick() {
        const target = document.querySelector('[data-a-target="stream-title"]');
        if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    function persistQuality(group) {
        if (!group?.includes('160p')) {
            console.log('[TwitchScript] Qualidade ignorada (não é 160p):', group);
            return;
        }
        localStorage.setItem(STORAGE_KEY, group);
        desiredGroup = group;
        console.log('[TwitchScript] Persisted desired quality group:', group);
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
                    console.log('[TwitchScript] Setting quality to:', target.name || target.group);
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
