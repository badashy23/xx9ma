// ==UserScript==
// @name         Email Verification Code Extractor (Outlook)
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Extrai códigos de verificação de emails no Outlook Web, como da Epic Games ou Discord.
// @author       You
// @match        https://outlook.live.com/mail/*
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const CODE_REGEX = /\b\d{4,8}\b/g;  // pega códigos entre 4 e 8 dígitos

    function extractCodesFromPreview(data) {
        if (!data) return;
        let found = [];

        function recursiveSearch(obj) {
            if (Array.isArray(obj)) {
                obj.forEach(recursiveSearch);
            } else if (typeof obj === 'object') {
                for (let key in obj) {
                    if (key.toLowerCase() === 'preview' && typeof obj[key] === 'string') {
                        const matches = obj[key].match(CODE_REGEX);
                        if (matches) found.push(...matches);
                    } else {
                        recursiveSearch(obj[key]);
                    }
                }
            }
        }

        recursiveSearch(data);

        if (found.length > 0) {
            console.log(`%c📨 Código(s) detectado(s) no preview: ${found.join(', ')}`, 'color: green; font-size: 16px; font-weight: bold;');
        }
    }

    /******************** XHR Hook ********************/
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (...args) {
        this._url = args[1];
        return _open.apply(this, args);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        const _onreadystatechange = this.onreadystatechange;

        this.onreadystatechange = function () {
            if (this.readyState === 4 && this.status === 200 && this.responseText) {
                try {
                    const response = JSON.parse(this.responseText);
                    extractCodesFromPreview(response);
                } catch (_) { }
            }
            if (_onreadystatechange) _onreadystatechange.apply(this, arguments);
        };

        return _send.apply(this, args);
    };

    /******************** fetch Hook ********************/
    const _fetch = window.fetch;
    window.fetch = async (...args) => {
        const response = await _fetch(...args);
        const clone = response.clone();

        clone.text().then(text => {
            try {
                const json = JSON.parse(text);
                extractCodesFromPreview(json);
            } catch (_) { }
        });

        return response;
    };

    console.log('%c📡 Monitor de códigos de verificação ativo!', 'color: cyan; font-weight: bold;');
})();
