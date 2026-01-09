// ==UserScript==
// @name         Evergore – Battle Overlay (Multiuser)
// @namespace    https://tampermonkey.net/
// @version      1.2
// @description  Kumulative Anzeige von Loot-Wert und EXP aus Battle-Reports
// @match        https://*.evergore.de/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'EvergoreBattleStats';

    /* =========================
       HILFSFUNKTIONEN
    ========================= */

    function normalizeName(text) {
        return text
            .replace(/\[\?\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getOwnUser() {
        const h2 = document.querySelector('#nav2 h2');
        return h2 ? h2.textContent.trim() : null;
    }

    function loadStats() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
                battles: {},
                stats: {},
                count: 0
            };
        } catch {
            return { battles: {}, stats: {}, count: 0 };
        }
    }

    function saveStats(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    /* =========================
       LOOT ERFASSUNG
    ========================= */

    function readLootTable() {
        const lootMap = {};
        const container = document.querySelector('#EgLoot');
        if (!container) return lootMap;

        container.querySelectorAll('table').forEach(table => {
            const header = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent)
                .join('|');

            if (!header.includes('Sieger') || !header.includes('Wert')) return;

            table.querySelectorAll('tr').forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length !== 3) return;

                const name = normalizeName(tds[0].textContent);
                const value = parseInt(tds[2].textContent.trim(), 10);

                if (!isNaN(value)) {
                    lootMap[name] = value;
                }
            });
        });

        return lootMap;
    }

    /* =========================
       EXP ERFASSUNG
    ========================= */

    function readExp(stats, lootMap) {
        const statusDiv = document.querySelector('#EgStatus');
        if (!statusDiv) return;

        let attackerTable = null;

        statusDiv.querySelectorAll('table').forEach(table => {
            const header = Array.from(table.querySelectorAll('th'))
                .map(th => th.textContent.trim())
                .join('|');

            if (header.includes('Angreifer') && header.includes('EXP')) {
                attackerTable = table;
            }
        });

        if (!attackerTable) return;

        attackerTable.querySelectorAll('tr').forEach(tr => {
            const tds = tr.querySelectorAll('td');
            if (tds.length < 5) return;

            const name = normalizeName(tds[0].textContent);
            const exp = parseFloat(tds[4].textContent.trim().replace(',', '.'));
            if (isNaN(exp)) return;

            if (!stats[name]) {
                stats[name] = { exp: 0, value: 0, fights: 0 };
            }

            stats[name].exp += exp;
            stats[name].value += lootMap[name] || 0;
            stats[name].fights += 1;
        });
    }

    /* =========================
       OVERLAY
    ========================= */

    function renderOverlay(data, ownUser) {
        let box = document.getElementById('eg-overlay');
        if (box) box.remove();

        box = document.createElement('div');
        box.id = 'eg-overlay';

        box.style.position = 'fixed';
        box.style.left = '20px';
        box.style.bottom = '20px';
        box.style.background = '#f4f4f4';
        box.style.color = '#222';
        box.style.border = '1px solid #aaa';
        box.style.padding = '10px';
        box.style.fontSize = '12px';
        box.style.minWidth = '300px';
        box.style.zIndex = 9999;
        box.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)';

        /* Header */
        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.marginBottom = '6px';
        header.innerHTML = `
            <strong>Jagdwerte  Anzahl: (${data.count})</strong>
            <button id="eg-reset" style="font-size:11px;cursor:pointer">Reset</button>
        `;
        box.appendChild(header);

        /* Tabelle */
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        table.innerHTML = `
            <thead>
                <tr style="background:#ddd">
                    <th style="text-align:left;padding:4px">User</th>
                    <th style="text-align:right;padding:4px">Wert</th>
                    <th style="text-align:right;padding:4px">EXP</th>
                </tr>
            </thead>
            <tbody>
                ${Object.entries(data.stats).map(([name, s]) => `
                    <tr style="${name === ownUser ? 'font-weight:bold' : ''}">
                        <td style="padding:4px">${name}</td>
                        <td style="padding:4px;text-align:right">${s.value}</td>
                        <td style="padding:4px;text-align:right">${s.exp.toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;

        box.appendChild(table);
        document.body.appendChild(box);

        /* Reset */
        document.getElementById('eg-reset').addEventListener('click', () => {
            if (!confirm('Alle Battle-Daten zurücksetzen?')) return;
            localStorage.removeItem(STORAGE_KEY);
            box.remove();
        });
    }

    /* =========================
       HAUPTABLAUF
    ========================= */

    const data = loadStats();
    const ownUser = getOwnUser();
    const battleId = document.title + '|' + location.href;

    if (!data.battles[battleId]) {
        const lootMap = readLootTable();
        readExp(data.stats, lootMap);

        data.battles[battleId] = true;
        data.count += 1;
        saveStats(data);
    }

    renderOverlay(data, ownUser);

})();
