// ==UserScript==
// @name         Evergore - Auftragsbuch (Multiuser tauglich)
// @namespace    https://evergore.de/
// @version      1.2
// @description  Rein lesende Auftrags- und Rezeptverwaltung für Evergore mit Zutatenverwaltung.
// @author       Omikun & ChatGPT
// @match        https://evergore.de/zwischenwelt?page=craft*
// @match        https://evergore.de/zwischenwelt?page=bank*
// @match        https://evergore.de/zwischenwelt?page=market*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const VERSION = '1.2';
    const PREFIX = 'eg_auftragsbuch_v01_';

    // GitHub-Updateprüfung: Es wird ausschließlich @version ausgelesen.
    // Kein automatischer Download, keine Installation und keine Änderung an Aufträgen.
    const GITHUB_VERSION_URL =
        'https://raw.githubusercontent.com/Omikun82/Evergore-Handel/main/Evergore-Auftragsbuch.js';

    const updateState = {
        checked: false,
        checking: false,
        latestVersion: '',
        message: ''
    };

    function compareVersions(a, b) {
        const parse = value => String(value)
            .split('.')
            .map(part => parseInt(part, 10) || 0);

        const va = parse(a);
        const vb = parse(b);
        const length = Math.max(va.length, vb.length);

        for (let i = 0; i < length; i++) {
            const na = va[i] || 0;
            const nb = vb[i] || 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    }

    function checkForUpdates() {
        if (updateState.checking) return;

        if (typeof GM_xmlhttpRequest !== 'function') {
            updateState.message = 'Update-Prüfung nicht verfügbar: GM_xmlhttpRequest fehlt.';
            render();
            return;
        }

        updateState.checking = true;
        updateState.checked = false;
        updateState.message = 'Prüfe GitHub-Version ...';
        render();

        GM_xmlhttpRequest({
            method: 'GET',
            url: GITHUB_VERSION_URL,
            headers: { 'Cache-Control': 'no-cache' },
            timeout: 15000,
            onload(response) {
                updateState.checking = false;
                updateState.checked = true;

                if (response.status !== 200) {
                    updateState.message = `GitHub-Prüfung fehlgeschlagen (HTTP ${response.status}).`;
                    render();
                    return;
                }

                const match = response.responseText.match(
                    /^\s*\/\/\s*@version\s+([0-9]+(?:\.[0-9]+)*)/m
                );

                if (!match) {
                    updateState.message = 'Keine gültige Versionsnummer auf GitHub gefunden.';
                    render();
                    return;
                }

                updateState.latestVersion = match[1];
                const comparison = compareVersions(updateState.latestVersion, VERSION);

                if (comparison > 0) {
                     updateState.message =
                      `Update verfügbar: Version ${updateState.latestVersion} (installiert: ${VERSION}).`;

                      updateState.link =
                         'https://github.com/Omikun82/Evergore-Handel/blob/main/Evergore-Auftragsbuch.js';
                } else if (comparison === 0) {
                    updateState.message = `Du verwendest die aktuelle Version ${VERSION}.`;
                } else {
                    updateState.message = `Deine Version ${VERSION} ist neuer als GitHub (${updateState.latestVersion}).`;
                }

                render();
            },
            onerror() {
                updateState.checking = false;
                updateState.checked = true;
                updateState.message = 'GitHub konnte nicht erreicht werden. Bitte später erneut versuchen.';
                render();
            },
            ontimeout() {
                updateState.checking = false;
                updateState.checked = true;
                updateState.message = 'Zeitüberschreitung bei der GitHub-Prüfung.';
                render();
            }
        });
    }

    const PAGE = new URL(location.href).searchParams.get('page') || '';
    const IS_CRAFT = PAGE.startsWith('craft');
    const IS_BANK = PAGE.startsWith('bank');
    const IS_MARKET = PAGE.startsWith('market');
    const IS_BAUSATZ = PAGE === 'craftkit' ||
        document.querySelector('#CONT_BODY[data-page="craftkit"]') !== null;

    const USER_SELECTOR = '#nav2 h2';

    const RESOURCE_NAMES = [
        'Kupfererz',
        'Kalkstein',
        'Buchenholz',
        'Leinen',
        'Weichpelze',
        'Korn'
    ];

    const clean = value => String(value ?? '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const safeText = value => clean(value).slice(0, 500);

    const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));

    const parseGermanNumber = value => {
        const s = String(value ?? '')
            .replace(/\./g, '')
            .replace(',', '.')
            .replace(/[^\d.-]/g, '');
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
    };

    const formatNumber = value =>
        Number(value || 0).toLocaleString('de-DE');

    const parseDurationMinutes = value => {
        const text = clean(value);
        if (!text) return 0;

        let hours = 0;
        let minutes = 0;

        const hm = text.match(/(\d+)\s*Std\.?/i);
        const mm = text.match(/(\d+)\s*Min\.?/i);

        if (hm) hours = Number(hm[1]);
        if (mm) minutes = Number(mm[1]);

        if (!hm && !mm) {
            const pair = text.match(/(\d+)\s*:\s*(\d+)/);
            if (pair) {
                hours = Number(pair[1]);
                minutes = Number(pair[2]);
            }
        }

        return hours * 60 + minutes;
    };

    const formatDuration = minutes => {
        const total = Math.max(0, Math.round(Number(minutes) || 0));
        const hours = Math.floor(total / 60);
        const mins = total % 60;
        return `${hours} Std. ${mins} Min.`;
    };

    const userNode = document.querySelector(USER_SELECTOR);
    const username = userNode ? safeText(userNode.textContent) : '';

    if (!username) {
        console.warn('[Auftragsbuch] Benutzername nicht gefunden. Speicherung wird deaktiviert.');
    }

    const storageKey = PREFIX + (
        username
            ? username.toLowerCase().replace(/[^a-z0-9_-]/gi, '_')
            : 'unbekannt'
    );

    const state = {
        username: username || 'Unbekannt',
        orders: [],
        nextNumber: 1,

        recipes: [],
        selectedRecipeId: '',

        resources: RESOURCE_NAMES.slice(),
        selectedResource: RESOURCE_NAMES[0],

        form: {
            type: 'handwerk',
            quantity: 1,
            customer: '',
            price: ''
        },

        expandedOrder: null,
        minimized: false
    };

    const id = () => 'r_' + Math.random().toString(36).slice(2, 11);
    const numberText = n => String(n).padStart(4, '0');

    async function readStore(key, fallback) {
        try {
            const value = await GM_getValue(key, fallback);
            return value == null ? fallback : value;
        } catch (error) {
            console.error('[Auftragsbuch] Lesen fehlgeschlagen:', error);
            return fallback;
        }
    }

    async function writeStore(key, value) {
        try {
            await GM_setValue(key, value);
            return true;
        } catch (error) {
            console.error('[Auftragsbuch] Speichern fehlgeschlagen:', error);
            alert('Auftragsbuch: Speichern fehlgeschlagen. Bitte Tampermonkey-Berechtigungen prüfen.');
            return false;
        }
    }

    async function save() {
        if (!username) return false;

        return writeStore(storageKey, {
            version: VERSION,
            username: state.username,
            nextNumber: state.nextNumber,
            orders: state.orders
        });
    }

    // ------------------------------------------------------------
    // ZUTATENSTATUS
    // ------------------------------------------------------------

    function ingredientKey(name) {
        return clean(name).toLowerCase();
    }

    function isIngredientPresent(order, name) {
        if (!order.ingredientStatus ||
            typeof order.ingredientStatus !== 'object') {
            order.ingredientStatus = {};
        }

        return order.ingredientStatus[ingredientKey(name)] === true;
    }

    function setIngredientPresent(order, name, present) {
        if (!order.ingredientStatus ||
            typeof order.ingredientStatus !== 'object') {
            order.ingredientStatus = {};
        }

        order.ingredientStatus[ingredientKey(name)] = Boolean(present);
    }

    // Zutaten gleicher Bezeichnung zusammenfassen.
    function getOrderIngredients(order) {
        if (!order.recipe) return [];

        const calc = getOrderCalculations(order);
        const grouped = new Map();

        for (const item of calc.ingredients) {
            const key = ingredientKey(item.name);

            if (!grouped.has(key)) {
                grouped.set(key, {
                    name: item.name,
                    amount: 0
                });
            }

            grouped.get(key).amount += item.amount;
        }

        return [...grouped.values()];
    }

    function getIngredientProgress(order) {
        const ingredients = getOrderIngredients(order);
        const total = ingredients.length;
        const present = ingredients.filter(item =>
            isIngredientPresent(order, item.name)
        ).length;

        return { total, present };
    }

    // ------------------------------------------------------------
    // NAMENSBEREINIGUNG FÜR NORMALES HANDWERK
    // ------------------------------------------------------------

    function getShortRecipeName(value) {
        let name = clean(value);

        name = name
            .replace(/⚒[\s\S]*$/u, '')
            .replace(/Handwerkspunkte\s*:[\s\S]*$/i, '')
            .replace(/\s+\d[\d.,]*\s*kg[\s\S]*$/i, '')
            .replace(/\s+Rohstoff[\s\S]*$/i, '')
            .replace(/\s*\(Verarbeitung[\s\S]*$/i, '')
            .replace(/\s*\(Herstellung[\s\S]*$/i, '');

        return clean(name);
    }

    // ------------------------------------------------------------
    // NORMALES HANDWERK
    // ------------------------------------------------------------

    function extractNormalCraft() {
        const found = [];
        const tables = [...document.querySelectorAll('#CONT_BODY table, main table')];

        for (const table of tables) {
            for (const row of [...table.querySelectorAll('tr')]) {
                const cells = [...row.children].filter(el =>
                    /^(TD|TH)$/i.test(el.tagName)
                );

                if (cells.length < 2) continue;

                const rowText = clean(row.innerText || row.textContent);
                if (!rowText) continue;

                const nameCell = cells.find(cell => {
                    const text = clean(cell.innerText || cell.textContent);
                    return /^\s*[\d.,]+\s+\S/.test(text);
                });

                if (!nameCell) continue;

                const nameCellText = clean(nameCell.innerText || nameCell.textContent);
                const outputMatch = nameCellText.match(/^\s*([\d.,]+)\s+(.+)$/);

                if (!outputMatch) continue;

                const yieldAmount = parseGermanNumber(outputMatch[1]);
                const productName = getShortRecipeName(outputMatch[2]);

                if (!productName || yieldAmount <= 0) continue;

                const joined = cells
                    .map(cell => cell.innerText || cell.textContent)
                    .join('\n');

                const hasRecipeClues =
                    /Handwerkspunkte|Zutaten|Gebäude\s*:|Dauer\s*:|Bauplan|⚒/i.test(joined);

                if (!hasRecipeClues) continue;

                const lines = joined
                    .split(/\n/)
                    .map(clean)
                    .filter(Boolean);

                const ingredients = [];
                let inIngredients = false;

                for (const line of lines) {
                    if (/^Zutaten\b/i.test(line)) {
                        inIngredients = true;
                        continue;
                    }

                    if (/^(Gebäude|Dauer|Handwerkspunkte)\s*:/i.test(line)) {
                        inIngredients = false;
                    }

                    if (!inIngredients) continue;

                    const match = line.match(/^([\d.,]+)\s+(.+)$/);
                    if (match) {
                        const amount = parseGermanNumber(match[1]);
                        const ingredientName = clean(match[2]);

                        if (amount > 0 && ingredientName) {
                            ingredients.push({
                                name: ingredientName,
                                amount
                            });
                        }
                    }
                }

                const buildingMatch = joined.match(/Gebäude\s*:\s*([^\n]+)/i);
                const durationMatch = joined.match(/Dauer\s*:\s*([^\n]+)/i);
                const pointsMatch = joined.match(/Handwerkspunkte\s*:\s*([^\n]+)/i);

                const skills = [];
                for (const line of lines) {
                    if (!line.includes('⚒')) continue;

                    const parts = line.split('⚒')
                        .map(clean)
                        .filter(Boolean);

                    for (const part of parts) {
                        if (
                            part.length < 2 ||
                            /Handwerkspunkte|Zutaten|Gebäude|Dauer/i.test(part)
                        ) continue;

                        skills.push(part);
                    }
                }

                const recipe = {
                    id: id(),
                    type: 'handwerk',
                    name: productName,
                    yieldAmount,
                    skills: [...new Set(skills)],
                    handwerkspunkte: safeText(pointsMatch?.[1] || ''),
                    ingredients,
                    building: safeText(buildingMatch?.[1] || ''),
                    duration: safeText(durationMatch?.[1] || ''),
                    durationMinutes: parseDurationMinutes(durationMatch?.[1] || ''),
                    durability: null,
                    customer: '',
                    priceSuggested: '',
                    sourceText: safeText(rowText),
                    capturedAt: new Date().toISOString()
                };

                const duplicate = found.some(existing =>
                    existing.type === recipe.type &&
                    existing.name.toLowerCase() === recipe.name.toLowerCase()
                );

                if (!duplicate) found.push(recipe);
            }
        }

        return found;
    }

    // ------------------------------------------------------------
    // BAUSATZERSTELLUNG: AUSLESEN DES SHADOW DOM
    // ------------------------------------------------------------

    function extractBausatz() {
        const host = document.querySelector('eg-crafting-reforge');
        if (!host) return [];

        const shadow = host.shadowRoot;
        if (!shadow) {
            console.warn('[Auftragsbuch] Bausatz-Shadow-DOM ist noch nicht verfügbar.');
            return [];
        }

        const name = clean(
            host.querySelector('[slot="name"]')?.textContent ||
            host.getAttribute('item-name') ||
            ''
        );

        if (!name) return [];

        const outputCount = Math.max(
            1,
            parseGermanNumber(
                shadow.querySelector('output[name="output_count"]')?.textContent || '1'
            )
        );

        const outputLevel = parseGermanNumber(
            shadow.querySelector('output[name="output_level"]')?.textContent || '0'
        );

        const durabilityLevel = parseGermanNumber(
            shadow.querySelector('output[name="output_wear"]')?.textContent || '0'
        );

        const character = clean(
            shadow.querySelector('input[name="character"]')?.value || ''
        );

        const grid = shadow.querySelector('.grid');
        if (!grid) return [];

        const panels = [...grid.children];

        const needsPanel = panels.find(panel =>
            /Benötigt/i.test(panel.querySelector('.header')?.textContent || '')
        );

        const valuesPanel = panels.find(panel =>
            /Werte/i.test(panel.querySelector('.header')?.textContent || '')
        );

        if (!needsPanel || !valuesPanel) return [];

        const needsText = clean(needsPanel.innerText || needsPanel.textContent);
        const valuesText = clean(valuesPanel.innerText || valuesPanel.textContent);

        const needsLines = (needsPanel.innerText || needsPanel.textContent)
            .split(/\n/)
            .map(clean)
            .filter(Boolean);

        const ingredients = [];
        let inIngredients = false;
        let handwerkspunkte = '';

        for (const line of needsLines) {
            if (/^Zutaten$/i.test(line)) {
                inIngredients = true;
                continue;
            }

            if (/^Dauer$/i.test(line)) {
                inIngredients = false;
                continue;
            }

            if (/HwP/i.test(line)) {
                handwerkspunkte = line;
                continue;
            }

            if (inIngredients) {
                const match = line.match(/^([\d.,]+)\s*\/\s*[\d.,]+\s+(.+)$/);

                if (match) {
                    const amount = parseGermanNumber(match[1]);
                    const ingredientName = clean(match[2]);

                    if (amount > 0 && ingredientName) {
                        ingredients.push({
                            name: ingredientName,
                            amount: amount / outputCount
                        });
                    }
                }
            }
        }

        const durationMatch = needsText.match(/(\d+\s*Std\.?\s*\d+\s*Min\.?)/i) ||
            needsText.match(/(\d+\s*Std\.?)/i) ||
            needsText.match(/(\d+\s*Min\.?)/i);

        const durationText = durationMatch ? clean(durationMatch[1]) : '';
        const totalDisplayedDuration = parseDurationMinutes(durationText);

        const durabilityMatch = valuesText.match(/\)\s*\((\d+)\)/) ||
            valuesText.match(/\((\d+)\)/);

        const durability = durabilityMatch
            ? Number(durabilityMatch[1])
            : 100 + (25 * durabilityLevel);

        const buildingMatch = valuesText.match(/Gebäude\s*:\s*([^\n]+)/i);
        const priceMatch = valuesText.match(/Unverbindlicher Preis\s*:\s*([\d.,]+)\s*Gold/i);
        const customerMatch = valuesText.match(/Hergestellt für\s+([^\n]+)/i);

        const characteristics = valuesText
            .split(/\n/)
            .map(clean)
            .filter(line =>
                line &&
                !line.startsWith(name) &&
                !/Hergestellt für|Gebäude\s*:|Unverbindlicher Preis/i.test(line)
            );

        const recipe = {
            id: id(),
            type: 'bausatz',
            name,
            yieldAmount: 1,
            pageCount: outputCount,
            level: outputLevel,
            durability,
            skills: [],
            handwerkspunkte,
            ingredients,
            building: safeText(buildingMatch?.[1] || ''),
            duration: durationText,
            durationMinutes: outputCount > 0
                ? totalDisplayedDuration / outputCount
                : totalDisplayedDuration,
            customer: safeText(customerMatch?.[1] || character),
            priceSuggested: priceMatch
                ? formatNumber(parseGermanNumber(priceMatch[1]))
                : '',
            characteristics,
            sourceText: safeText(`${needsText} | ${valuesText}`),
            capturedAt: new Date().toISOString()
        };

        return [recipe];
    }

    // ------------------------------------------------------------
    // ROHSTOFFAUSWAHL
    // ------------------------------------------------------------

    function extractResources() {
        return RESOURCE_NAMES.slice();
    }

    // ------------------------------------------------------------
    // REZEPTE ZUSAMMENFÜHREN
    // ------------------------------------------------------------

    function extractRecipes() {
        if (IS_BAUSATZ) {
            return extractBausatz();
        }

        return extractNormalCraft();
    }

    function recipeById(recipeId) {
        return state.recipes.find(recipe => recipe.id === recipeId);
    }

    // ------------------------------------------------------------
    // AUFTRAGS-BERECHNUNGEN
    // ------------------------------------------------------------

    function getOrderCalculations(order) {
        const recipe = order.recipe;
        const quantity = Math.max(1, Number(order.quantity) || 1);

        if (!recipe) {
            return {
                runs: 0,
                production: 0,
                overproduction: 0,
                ingredients: [],
                durationMinutes: 0
            };
        }

        const yieldAmount = Math.max(1, Number(recipe.yieldAmount) || 1);
        const runs = Math.ceil(quantity / yieldAmount);
        const production = runs * yieldAmount;
        const overproduction = production - quantity;

        const ingredients = (recipe.ingredients || []).map(item => ({
            name: item.name,
            amount: Math.ceil((Number(item.amount) || 0) * runs)
        }));

        const durationMinutes =
            (Number(recipe.durationMinutes) || 0) * runs;

        return {
            runs,
            production,
            overproduction,
            ingredients,
            durationMinutes
        };
    }

    // ------------------------------------------------------------
    // STYLES
    // ------------------------------------------------------------

    function addStyles() {
        const css = `
#eg-orderbook{
 position:fixed;right:14px;bottom:14px;z-index:2147483000;
 width:390px;max-width:calc(100vw - 28px);max-height:82vh;
 background:#f7f7f7;color:#171717;border:1px solid #777;
 box-shadow:0 3px 14px #0005;border-radius:5px;
 font:13px/1.4 Arial,sans-serif;display:flex;flex-direction:column
}
#eg-orderbook *{box-sizing:border-box}
#eg-orderbook .eg-head{
 display:flex;align-items:center;justify-content:space-between;
 background:#e5e5e5;padding:7px 9px;border-bottom:1px solid #aaa;
 font-weight:bold
}
#eg-orderbook button,#eg-orderbook input,#eg-orderbook select{font:inherit}
#eg-orderbook button{
 cursor:pointer;border:1px solid #888;border-radius:3px;
 background:#fff;color:#111;padding:4px 7px
}
#eg-orderbook button:hover{background:#eee}
#eg-orderbook .eg-body{padding:9px;overflow:auto}
#eg-orderbook.eg-mini{width:220px;max-height:none}
#eg-orderbook.eg-mini .eg-body{display:none}
#eg-orderbook label{display:block;font-weight:bold;margin:7px 0 3px}
#eg-orderbook input,#eg-orderbook select{
 width:100%;padding:5px;border:1px solid #aaa;border-radius:3px;
 background:white;color:#111
}
#eg-orderbook .eg-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
#eg-orderbook .eg-actions{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
#eg-orderbook .eg-muted{color:#555;font-size:11px}
#eg-orderbook .eg-list{margin-top:9px;border-top:1px solid #bbb}
#eg-orderbook .eg-order{padding:7px 2px;border-bottom:1px solid #ccc}
#eg-orderbook .eg-order-top{
 display:flex;justify-content:space-between;gap:6px;align-items:center
}
#eg-orderbook .eg-order-title{font-weight:bold;overflow-wrap:anywhere}
#eg-orderbook .eg-detail{
 background:#fff;border:1px solid #ddd;padding:7px;margin-top:6px
}
#eg-orderbook .eg-detail ul{margin:3px 0 5px 18px;padding:0}
#eg-orderbook .eg-stat{
 display:grid;grid-template-columns:1fr auto;gap:3px
}
#eg-orderbook .eg-warning{
 background:#fff3cd;border:1px solid #e4c76c;padding:6px;margin:7px 0
}
#eg-orderbook .eg-section{
 border:1px solid #ccc;background:#fff;padding:6px;margin-top:7px
}
#eg-orderbook .eg-section-title{
 font-weight:bold;border-bottom:1px solid #ddd;margin-bottom:5px;padding-bottom:3px
}
#eg-orderbook .eg-ingredient{
 display:flex;align-items:center;gap:7px;
 padding:5px 2px;border-bottom:1px solid #eee;
 font-weight:normal;margin:0!important
}
#eg-orderbook .eg-ingredient:last-child{border-bottom:0}
#eg-orderbook .eg-ingredient input{
 width:16px;height:16px;margin:0;flex:0 0 16px;
 accent-color:#32834a;cursor:pointer
}
#eg-orderbook .eg-ingredient.eg-present{
 color:#26713b
}
#eg-orderbook .eg-ingredient.eg-present .eg-ingredient-name{
 text-decoration:line-through
}
#eg-orderbook .eg-progress{
 font-size:11px;color:#555;margin:3px 0 5px
}
#eg-orderbook .eg-bank-order{
 background:#fff;border:1px solid #ccc;padding:7px;margin-top:8px
}
#eg-orderbook .eg-bank-order-title{
 font-weight:bold;border-bottom:1px solid #ddd;padding-bottom:5px;margin-bottom:4px
}
#eg-orderbook .eg-bank-order-meta{
 font-size:11px;color:#555;margin-bottom:5px
}
#eg-orderbook .eg-empty{
 padding:8px;background:#fff;border:1px solid #ddd;margin-top:7px
}
@media(max-width:600px){
 #eg-orderbook{right:6px;bottom:6px;width:calc(100vw - 12px)}
}
`;

        if (typeof GM_addStyle === 'function') {
            GM_addStyle(css);
        } else {
            const style = document.createElement('style');
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    // ------------------------------------------------------------
    // ZUTATENLISTE FÜR EINEN AUFTRAG
    // ------------------------------------------------------------

    function renderIngredientChecklist(order, bankMode = false) {
        const ingredients = getOrderIngredients(order);
        const progress = getIngredientProgress(order);

        if (!ingredients.length) {
            return `<div class="eg-muted">Keine Zutaten hinterlegt.</div>`;
        }

        let html = `
<div class="eg-progress">
 ${progress.present} von ${progress.total} Zutaten als vorhanden markiert
</div>`;

        for (const item of ingredients) {
            const present = isIngredientPresent(order, item.name);
            const checkbox = bankMode
                ? `<input type="checkbox"
                     data-action="ingredient"
                     data-id="${escapeHTML(order.id)}"
                     data-ingredient="${escapeHTML(item.name)}"
                     ${present ? 'checked' : ''}>`
                : '';

            html += `
<label class="eg-ingredient ${present ? 'eg-present' : ''}">
 ${checkbox}
 <span class="eg-ingredient-name">${escapeHTML(item.name)}</span>
 <span style="margin-left:auto;white-space:nowrap">
  ${formatNumber(item.amount)} ×
 </span>
 ${present && !bankMode ? '<span title="Vorhanden">✓</span>' : ''}
</label>`;
        }

        return html;
    }

    // ------------------------------------------------------------
    // BANKÜBERSICHT
    // ------------------------------------------------------------

    function renderBankIngredients() {
        const openOrders = state.orders
            .filter(order => order.status !== 'Erledigt')
            .slice()
            .sort((a, b) => (Number(a.number) || 0) - (Number(b.number) || 0));

        if (!openOrders.length) {
            return `
<div class="eg-empty">
 Keine offenen Aufträge mit Zutaten vorhanden.
</div>`;
        }

        // Alle Zutaten der offenen Aufträge zusammenfassen.
        // Der Status bleibt dennoch je Auftrag gespeichert.
        const groupedIngredients = new Map();

        for (const order of openOrders) {
            for (const item of getOrderIngredients(order)) {
                const key = ingredientKey(item.name);

                if (!groupedIngredients.has(key)) {
                    groupedIngredients.set(key, {
                        name: item.name,
                        amount: 0,
                        orders: []
                    });
                }

                const group = groupedIngredients.get(key);
                group.amount += item.amount;
                group.orders.push({
                    order,
                    amount: item.amount,
                    present: isIngredientPresent(order, item.name)
                });
            }
        }

        let html = `
<div class="eg-section">
 <div class="eg-section-title">Zutaten – Gesamtbedarf</div>
 <div class="eg-muted">
  Hier kannst du eine Zutat für alle Aufträge gleichzeitig bestätigen
  oder die Teilmengen weiter unten einzeln abhaken.
  Die Gesamtmarkierung aktualisiert die jeweiligen Auftragsmarkierungen.
 </div>`;

        if (groupedIngredients.size) {
            for (const item of [...groupedIngredients.values()].sort((a, b) =>
                a.name.localeCompare(b.name, 'de')
            )) {
                const presentCount = item.orders.filter(entry => entry.present).length;
                const totalCount = item.orders.length;
                const allPresent = presentCount === totalCount;
                const partiallyPresent = presentCount > 0 && !allPresent;

                html += `
<label class="eg-ingredient ${allPresent ? 'eg-present' : ''}" style="padding:7px 2px">
 <input type="checkbox"
        data-action="ingredient-group"
        data-ingredient="${escapeHTML(item.name)}"
        data-partial="${partiallyPresent ? 'true' : 'false'}"
        ${allPresent ? 'checked' : ''}>
 <span class="eg-ingredient-name">${escapeHTML(item.name)}</span>
 <span style="margin-left:auto;white-space:nowrap;font-weight:bold">
  ${formatNumber(item.amount)} Stück
 </span>
 <span class="eg-muted" style="white-space:nowrap">
  ${presentCount}/${totalCount}
 </span>
</label>`;
            }
        } else {
            html += `<div class="eg-muted">Keine Rezeptzutaten in offenen Aufträgen vorhanden.</div>`;
        }

        html += `
</div>
<div class="eg-section">
 <div class="eg-section-title">Einzelmengen nach Auftrag</div>
 <div class="eg-muted">
  Einzelne Teilmengen können unabhängig voneinander bestätigt werden.
 </div>
</div>`;

        let ingredientOrders = 0;

        for (const order of openOrders) {
            const ingredients = getOrderIngredients(order);
            if (!ingredients.length) continue;

            ingredientOrders++;

            const orderName = order.type === 'rohstoff'
                ? order.resource
                : order.recipe?.name || 'Unbekannter Auftrag';

            const progress = getIngredientProgress(order);

            html += `
<div class="eg-bank-order">
 <div class="eg-bank-order-title">
  #${numberText(order.number)} – ${escapeHTML(orderName)}
 </div>
 <div class="eg-bank-order-meta">
  ${formatNumber(order.quantity)} Stück ·
  ${escapeHTML(order.customer || 'Kein Auftraggeber')} ·
  ${progress.present}/${progress.total} Zutaten vorhanden
 </div>
 ${renderIngredientChecklist(order, true)}
</div>`;
        }

        if (!ingredientOrders) {
            html += `
<div class="eg-empty">
 Für die offenen Aufträge sind keine Zutatenlisten vorhanden.
</div>`;
        }

        const resourceOrders = openOrders.filter(order =>
            order.type === 'rohstoff'
        );

        if (resourceOrders.length) {
            html += `
<div class="eg-section">
 <div class="eg-section-title">Rohstoffaufträge</div>
 <div class="eg-muted">
  Diese Aufträge benötigen keine Rezeptzutaten und werden deshalb nicht in der Zutaten-Checkliste geführt.
 </div>
 ${resourceOrders.map(order => `
  <div style="padding:4px 0;border-bottom:1px solid #eee">
   #${numberText(order.number)} – ${escapeHTML(order.resource)}
   (${formatNumber(order.quantity)} Stück)
  </div>
 `).join('')}
</div>`;
        }

        return html;
    }

    // ------------------------------------------------------------
    // MARKTÜBERSICHT: ALLE NOCH BENÖTIGTEN ZUTATEN
    // ------------------------------------------------------------

    function getMarketRequirements() {
        const grouped = new Map();

        const openOrders = state.orders.filter(order =>
            order.status !== 'Erledigt' && order.recipe
        );

        for (const order of openOrders) {
            const ingredients = getOrderIngredients(order);

            for (const item of ingredients) {
                // Bereits als vorhanden markierte Zutaten
                // werden nicht mehr als Marktbedarf gezählt.
                if (isIngredientPresent(order, item.name)) continue;

                const key = ingredientKey(item.name);

                if (!grouped.has(key)) {
                    grouped.set(key, {
                        name: item.name,
                        amount: 0,
                        orders: []
                    });
                }

                const entry = grouped.get(key);
                entry.amount += item.amount;

                entry.orders.push({
                    number: order.number,
                    id: order.id,
                    name: order.recipe.name || 'Unbekannter Auftrag',
                    quantity: order.quantity,
                    customer: order.customer || '',
                    amount: item.amount
                });
            }
        }

        return [...grouped.values()].sort((a, b) =>
            a.name.localeCompare(b.name, 'de')
        );
    }

    function renderMarketRequirements() {
        const requirements = getMarketRequirements();

        if (!requirements.length) {
            return `
<div class="eg-empty">
 <b>Kein offener Marktbedarf vorhanden.</b>
 <div class="eg-muted" style="margin-top:4px">
  Entweder sind keine offenen Handwerksaufträge vorhanden
  oder alle benötigten Zutaten wurden bereits als vorhanden markiert.
 </div>
</div>`;
        }

        const totalTypes = requirements.length;

        let html = `
<div class="eg-section">
 <div class="eg-section-title">Gesamter Marktbedarf</div>
 <div class="eg-muted">
  ${totalTypes} verschiedene Gegenstände ·
  Bereits auf der Bank als vorhanden markierte Zutaten
  werden nicht mitgezählt.
 </div>
</div>`;

        for (const item of requirements) {
            const orderDetails = item.orders
                .slice()
                .sort((a, b) => a.number - b.number)
                .map(order => `
<li>
 <b>#${numberText(order.number)} – ${escapeHTML(order.name)}</b><br>
 ${formatNumber(order.amount)} ×
 ${escapeHTML(item.name)}
 ${order.customer
     ? `<span class="eg-muted"> · ${escapeHTML(order.customer)}</span>`
     : ''}
</li>`)
                .join('');

            html += `
<div class="eg-bank-order">
 <details>
  <summary style="cursor:pointer">
   <span style="font-weight:bold">
    ${escapeHTML(item.name)}
   </span>
   <span style="float:right;font-weight:bold">
    ${formatNumber(item.amount)} Stück
   </span>
  </summary>
  <div style="border-top:1px solid #ddd;margin-top:7px;padding-top:5px">
   <div class="eg-muted">
    Benötigt für ${item.orders.length} Auftrag/Aufträge:
   </div>
   <ul style="margin:5px 0 3px 18px;padding:0">
    ${orderDetails}
   </ul>
  </div>
 </details>
</div>`;
        }

        return html;
    }

    // ------------------------------------------------------------
    // AUFTRAGSDETAILS
    // ------------------------------------------------------------

    function renderOrderDetails(order) {
        const recipe = order.recipe;
        const calc = getOrderCalculations(order);

        let html = `
<div class="eg-detail">
 <div class="eg-stat"><span>Auftraggeber</span><b>${escapeHTML(order.customer || '–')}</b></div>
 <div class="eg-stat"><span>Abgemachter Preis</span><b>${order.price ? escapeHTML(order.price) + ' Gold' : '–'}</b></div>
 <div class="eg-stat"><span>Auftragsmenge</span><b>${formatNumber(order.quantity)} Stück</b></div>
`;

        if (recipe) {
            html += `
 <div class="eg-stat"><span>Ausführungen</span><b>${formatNumber(calc.runs)}</b></div>
 <div class="eg-stat"><span>Produktion</span><b>${formatNumber(calc.production)} Stück</b></div>
 <div class="eg-stat"><span>Überproduktion</span><b>${formatNumber(calc.overproduction)} Stück</b></div>
 <div class="eg-stat"><span>Gebäude</span><b>${escapeHTML(recipe.building || '–')}</b></div>
 <div class="eg-stat"><span>Dauer je Ausführung</span><b>${escapeHTML(recipe.duration || '–')}</b></div>
 <div class="eg-stat"><span>Gesamtdauer</span><b>${formatDuration(calc.durationMinutes)}</b></div>
 <div class="eg-stat"><span>Handwerkspunkte</span><b>${escapeHTML(recipe.handwerkspunkte || '–')}</b></div>
`;

            if (recipe.type === 'bausatz') {
                html += `
 <div class="eg-stat"><span>Haltbarkeit</span><b>${escapeHTML(recipe.durability ?? '–')}</b></div>
 <div class="eg-stat"><span>Personalisiert für</span><b>${escapeHTML(recipe.customer || order.customer || '–')}</b></div>
 <div class="eg-stat"><span>Stufe</span><b>${escapeHTML(recipe.level ?? '–')}</b></div>
`;

                if (recipe.characteristics?.length) {
                    html += `<div class="eg-section"><div class="eg-section-title">Eigenschaften</div>`;
                    html += recipe.characteristics.map(line =>
                        `<div>${escapeHTML(line)}</div>`
                    ).join('');
                    html += `</div>`;
                }
            } else {
                html += `
 <div class="eg-section">
  <div class="eg-section-title">Fähigkeiten</div>
  ${escapeHTML((recipe.skills || []).join(' · ') || 'Nicht erkannt')}
 </div>`;
            }

            html += `
 <div class="eg-section">
  <div class="eg-section-title">Zutatenstatus</div>
  ${renderIngredientChecklist(order, false)}
  <div class="eg-muted" style="margin-top:5px">
   Die Markierungen können auf der Bankseite geändert werden.
  </div>
 </div>`;

            if (recipe.priceSuggested) {
                html += `<div class="eg-stat"><span>Unverbindlicher Preis je Stück</span><b>${escapeHTML(recipe.priceSuggested)} Gold</b></div>`;
            }

            if (recipe.sourceText) {
                html += `
 <details style="margin-top:7px">
  <summary>Gespeicherte Quelldaten</summary>
  <div class="eg-muted">${escapeHTML(recipe.sourceText)}</div>
 </details>`;
            }
        } else {
            html += `
 <div class="eg-stat"><span>Rohstoff</span><b>${escapeHTML(order.resource || '–')}</b></div>
 <div class="eg-muted" style="margin-top:6px">
  Für Rohstoffaufträge gibt es keine Rezeptzutaten.
 </div>`;
        }

        html += `
 <div class="eg-actions">
  <button data-action="status" data-id="${order.id}">
   ${order.status === 'Erledigt' ? 'Wieder öffnen' : 'Als erledigt markieren'}
  </button>
  <button data-action="delete" data-id="${order.id}">Löschen</button>
 </div>
</div>`;

        return html;
    }

    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------

    function render() {
        const root = document.getElementById('eg-orderbook');
        if (!root) return;

        root.classList.toggle('eg-mini', state.minimized);

        const pageLabel = IS_CRAFT
            ? (IS_BAUSATZ ? 'Bausatzerstellung' : 'Handwerk / Rohstoffe')
            : IS_BANK ? 'Bank'
            : IS_MARKET ? 'Markt'
            : PAGE;

        const openCount = state.orders.filter(order =>
            order.status !== 'Erledigt'
        ).length;

        let body = '';

        body += `
<div class="eg-muted">
 Benutzer: ${escapeHTML(state.username)} · Version ${VERSION}
</div>
<div class="eg-section">
 <div class="eg-section-title">Software-Update</div>
 <div class="eg-muted">
  ${escapeHTML(updateState.message || 'Noch keine Update-Prüfung durchgeführt.')}
 </div>
 <div class="eg-actions">
  <button data-action="check-update" ${updateState.checking ? 'disabled' : ''}>
   ${updateState.checking ? 'Prüfe ...' : 'Auf Updates prüfen'}
  </button>
 </div>
 ${updateState.checked && updateState.latestVersion && compareVersions(updateState.latestVersion, VERSION) > 0 ? `
  <div class="eg-warning">
   <a
    href="https://github.com/Omikun82/Evergore-Handel/blob/main/Evergore-Auftragsbuch.js"
    target="_blank"
    rel="noopener noreferrer">
    Update auf GitHub öffnen
</a>
  </div>
 ` : ''}
</div>`;

        if (IS_CRAFT) {
            body += `
<div class="eg-section">
 <div class="eg-section-title">Neuen Auftrag anlegen</div>

 <label for="eg-type">Auftragsart</label>
 <select id="eg-type">
  <option value="handwerk" ${state.form.type === 'handwerk' ? 'selected' : ''}>Handwerk / Bausatz</option>
  <option value="rohstoff" ${state.form.type === 'rohstoff' ? 'selected' : ''}>Rohstoffgewinnung</option>
 </select>
`;

            if (state.form.type === 'rohstoff') {
                body += `
 <label for="eg-resource">Rohstoff</label>
 <select id="eg-resource">
  ${state.resources.map(resource =>
      `<option value="${escapeHTML(resource)}" ${resource === state.selectedResource ? 'selected' : ''}>${escapeHTML(resource)}</option>`
  ).join('')}
 </select>`;
            } else {
                const options = state.recipes.map(recipe =>
                    `<option value="${recipe.id}" ${recipe.id === state.selectedRecipeId ? 'selected' : ''}>
                     ${escapeHTML(recipe.name)}${recipe.type === 'bausatz'
                         ? ` (Bausatz · Haltbarkeit ${escapeHTML(recipe.durability ?? '–')})`
                         : ` (${formatNumber(recipe.yieldAmount)} je Bauplan)`}
                    </option>`
                ).join('');

                if (state.recipes.length) {
                    body += `
 <label for="eg-recipe">Erkanntes Rezept / Bausatz</label>
 <select id="eg-recipe">
  <option value="">Bitte auswählen …</option>
  ${options}
 </select>`;
                } else {
                    body += `
 <div class="eg-warning">
  ${IS_BAUSATZ
      ? 'Kein Bausatz erkannt. Prüfe, ob die Bausatzanzeige vollständig geladen ist.'
      : 'Keine normalen Handwerksrezepte erkannt. Du kannst die Rohstoffaufträge weiterhin verwenden.'}
 </div>`;
                }
            }

            body += `
 <div class="eg-grid">
  <div>
   <label for="eg-quantity">Gewünschte Menge</label>
   <input id="eg-quantity" type="number" min="1" step="1" value="${state.form.quantity}">
  </div>
  <div>
   <label for="eg-customer">Besteller / Charakter</label>
   <input id="eg-customer" maxlength="80" value="${escapeHTML(state.form.customer)}" placeholder="Optional">
  </div>
 </div>

 <label for="eg-price">Abgemachter Preis (optional, Gold)</label>
 <input id="eg-price" type="text" value="${escapeHTML(state.form.price)}" placeholder="z. B. 5000">

 <div class="eg-actions">
  <button data-action="add">Auftrag hinzufügen</button>
  <button data-action="rescan">Seite neu einlesen</button>
 </div>

 <div class="eg-muted" style="margin-top:5px">
  Es werden ausschließlich sichtbare Seiteninhalte gelesen. Das Script bedient keine Evergore-Formulare oder -Buttons.
 </div>
</div>`;
        } else if (IS_BANK) {
            body += renderBankIngredients();
        } else if (IS_MARKET) {
            body += renderMarketRequirements();
        }

        body += `
<div class="eg-list">
 <b>Aufträge (${openCount} offen / ${state.orders.length} gesamt)</b>`;

        if (!state.orders.length) {
            body += `<div class="eg-muted" style="padding:7px 0">Noch keine Aufträge vorhanden.</div>`;
        }

        for (const order of state.orders.slice().sort((a, b) =>
            (Number(b.number) || 0) - (Number(a.number) || 0)
        )) {
            const orderName = order.type === 'rohstoff'
                ? order.resource
                : order.recipe?.name || 'Unbekannter Auftrag';

            const progress = order.recipe
                ? getIngredientProgress(order)
                : null;

            body += `
<div class="eg-order">
 <div class="eg-order-top">
  <span class="eg-order-title">#${numberText(order.number)} – ${escapeHTML(orderName)}</span>
  <span>${formatNumber(order.quantity)} Stk.</span>
 </div>
 <div class="eg-muted">
  ${escapeHTML(order.status)} · ${new Date(order.createdAt).toLocaleDateString('de-DE')}
  ${order.type === 'rohstoff' ? ' · Rohstoff' : order.recipe?.type === 'bausatz' ? ' · Bausatz' : ' · Handwerk'}
  ${progress ? ` · Zutaten ${progress.present}/${progress.total}` : ''}
 </div>
 <div class="eg-actions">
  <button data-action="details" data-id="${order.id}">
   ${state.expandedOrder === order.id ? 'Details schließen' : 'Details'}
  </button>
 </div>
 ${state.expandedOrder === order.id ? renderOrderDetails(order) : ''}
</div>`;
        }

        body += `
</div>
<div class="eg-actions">
 <button data-action="export">JSON-Backup</button>
 <button data-action="reset">Alle Aufträge zurücksetzen</button>
</div>`;

        root.querySelector('.eg-body').innerHTML = body;
        root.querySelector('.eg-count').textContent = `${openCount} offen`;
        root.querySelector('.eg-head-title').textContent = `Auftragsbuch – ${pageLabel}`;

        bindUI(root);
    }

    // ------------------------------------------------------------
    // UI-BINDINGS
    // ------------------------------------------------------------

    function bindUI(root) {
        const typeSelect = root.querySelector('#eg-type');

        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                state.form.type = typeSelect.value;
                render();
            });
        }

        const recipeSelect = root.querySelector('#eg-recipe');

        if (recipeSelect) {
            recipeSelect.addEventListener('change', () => {
                state.selectedRecipeId = recipeSelect.value;
            });
        }

        const resourceSelect = root.querySelector('#eg-resource');

        if (resourceSelect) {
            resourceSelect.addEventListener('change', () => {
                state.selectedResource = resourceSelect.value;
            });
        }

        const quantityInput = root.querySelector('#eg-quantity');

        if (quantityInput) {
            quantityInput.addEventListener('input', () => {
                state.form.quantity = Math.max(
                    1,
                    parseInt(quantityInput.value, 10) || 1
                );
            });
        }

        const customerInput = root.querySelector('#eg-customer');

        if (customerInput) {
            customerInput.addEventListener('input', () => {
                state.form.customer = customerInput.value;
            });
        }

        const priceInput = root.querySelector('#eg-price');

        if (priceInput) {
            priceInput.addEventListener('input', () => {
                state.form.price = priceInput.value;
            });
        }

        // Zutatenmarkierungen: ausschließlich im Auftragsbuch-Overlay.
        root.querySelectorAll('input[data-action="ingredient"]').forEach(input => {
            input.addEventListener('change', async () => {
                const order = state.orders.find(item =>
                    item.id === input.dataset.id
                );

                if (!order) return;

                setIngredientPresent(
                    order,
                    input.dataset.ingredient,
                    input.checked
                );

                await save();
                render();
            });
        });

        // Kumulative Markierung: dieselbe Zutat in allen offenen Aufträgen setzen.
        root.querySelectorAll('input[data-action="ingredient-group"]').forEach(input => {
            input.indeterminate = input.dataset.partial === 'true';

            input.addEventListener('change', async () => {
                const key = ingredientKey(input.dataset.ingredient);
                const present = input.checked;

                for (const order of state.orders) {
                    if (order.status === 'Erledigt') continue;

                    const matchingIngredient = getOrderIngredients(order).find(item =>
                        ingredientKey(item.name) === key
                    );

                    if (matchingIngredient) {
                        setIngredientPresent(order, matchingIngredient.name, present);
                    }
                }

                await save();
                render();
            });
        });

        root.querySelectorAll('button[data-action]').forEach(button => {
            button.addEventListener('click', async () => {
                const action = button.dataset.action;
                const orderId = button.dataset.id;

                if (action === 'add') {
                    await addOrder(root);
                }

                if (action === 'check-update') {
                    checkForUpdates();
                }

                if (action === 'rescan') {
                    state.recipes = extractRecipes();

                    if (state.recipes.length) {
                        state.selectedRecipeId = state.recipes[0].id;
                    } else {
                        state.selectedRecipeId = '';
                    }

                    render();

                    alert(
                        `${state.recipes.length} Rezept(e) erkannt. ` +
                        'Bereits gespeicherte Aufträge bleiben unverändert.'
                    );
                }

                if (action === 'details') {
                    state.expandedOrder =
                        state.expandedOrder === orderId ? null : orderId;
                    render();
                }

                if (action === 'status') {
                    const order = state.orders.find(item => item.id === orderId);

                    if (order) {
                        order.status = order.status === 'Erledigt'
                            ? 'Offen'
                            : 'Erledigt';
                    }

                    await save();
                    render();
                }

                if (action === 'delete') {
                    if (!confirm('Diesen Auftrag endgültig löschen?')) return;

                    state.orders = state.orders.filter(item => item.id !== orderId);
                    state.expandedOrder = null;

                    await save();
                    render();
                }

                if (action === 'reset') {
                    if (!confirm(
                        'Wirklich alle Aufträge dieses Charakters löschen? ' +
                        'Diese Aktion kann nicht rückgängig gemacht werden.'
                    )) return;

                    state.orders = [];
                    state.nextNumber = 1;
                    state.expandedOrder = null;

                    await save();
                    render();
                }

                if (action === 'export') {
                    exportBackup();
                }
            });
        });
    }

    // ------------------------------------------------------------
    // AUFTRAG ANLEGEN
    // ------------------------------------------------------------

    async function addOrder(root) {
        const quantity = Math.max(
            1,
            parseInt(root.querySelector('#eg-quantity')?.value, 10) || 1
        );

        const customer = clean(
            root.querySelector('#eg-customer')?.value || ''
        );

        const price = clean(
            root.querySelector('#eg-price')?.value || ''
        );

        const type = root.querySelector('#eg-type')?.value || 'handwerk';

        let order;

        if (type === 'rohstoff') {
            const resource = root.querySelector('#eg-resource')?.value ||
                state.selectedResource;

            if (!RESOURCE_NAMES.includes(resource)) {
                alert('Bitte einen gültigen Rohstoff auswählen.');
                return;
            }

            order = {
                id: id(),
                number: state.nextNumber++,
                createdAt: new Date().toISOString(),
                status: 'Offen',
                type: 'rohstoff',
                resource,
                quantity,
                customer,
                price,
                ingredientStatus: {}
            };
        } else {
            const selectedId = root.querySelector('#eg-recipe')?.value ||
                state.selectedRecipeId;

            const recipe = recipeById(selectedId);

            if (!recipe) {
                alert('Bitte zuerst ein erkanntes Rezept oder einen Bausatz auswählen.');
                return;
            }

            const recipeSnapshot = JSON.parse(JSON.stringify(recipe));

            order = {
                id: id(),
                number: state.nextNumber++,
                createdAt: new Date().toISOString(),
                status: 'Offen',
                type: recipe.type || 'handwerk',
                quantity,
                customer,
                price,
                recipe: recipeSnapshot,
                ingredientStatus: {}
            };
        }

        state.orders.push(order);
        state.form = {
            type,
            quantity: 1,
            customer: '',
            price: ''
        };
        state.expandedOrder = order.id;

        await save();
        render();
    }

    // ------------------------------------------------------------
    // JSON-BACKUP
    // ------------------------------------------------------------

    function exportBackup() {
        const payload = JSON.stringify({
            version: VERSION,
            username: state.username,
            nextNumber: state.nextNumber,
            orders: state.orders
        }, null, 2);

        const blob = new Blob([payload], {
            type: 'application/json'
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = url;
        anchor.download = `evergore-auftragsbuch-${state.username}.json`;
        anchor.click();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // ------------------------------------------------------------
    // INITIALISIERUNG
    // ------------------------------------------------------------

    async function init() {
        const stored = username
            ? await readStore(storageKey, null)
            : null;

        if (stored && typeof stored === 'object') {
            state.orders = Array.isArray(stored.orders)
                ? stored.orders
                : [];

            state.nextNumber = Math.max(
                Number(stored.nextNumber) || 1,
                ...state.orders.map(order =>
                    (Number(order.number) || 0) + 1
                )
            );

            for (const order of state.orders) {
                if (!order.type) {
                    order.type = order.recipe?.type || 'handwerk';
                }

                if (order.recipe && !order.recipe.type) {
                    order.recipe.type = 'handwerk';
                }

                // V0.3-Aufträge erhalten automatisch einen leeren Zutatenstatus.
                if (!order.ingredientStatus ||
                    typeof order.ingredientStatus !== 'object') {
                    order.ingredientStatus = {};
                }
            }
        }

        if (IS_CRAFT) {
            state.resources = extractResources();
            state.recipes = extractRecipes();

            if (state.recipes.length) {
                state.selectedRecipeId = state.recipes[0].id;
            }
        }

        addStyles();

        const root = document.createElement('section');
        root.id = 'eg-orderbook';

        root.innerHTML = `
<div class="eg-head">
 <span class="eg-head-title">Auftragsbuch</span>
 <span style="display:flex;gap:6px;align-items:center">
  <small class="eg-count">0 offen</small>
  <button type="button" data-action="minimize" title="Minimieren">−</button>
 </span>
</div>
<div class="eg-body"></div>
`;

        document.body.appendChild(root);

        root.querySelector('[data-action="minimize"]')
            .addEventListener('click', () => {
                state.minimized = !state.minimized;
                render();
            });

        render();

        console.info(
            `[Auftragsbuch] Version ${VERSION} geladen für ${state.username}. ` +
            'Modus: ausschließlich lesend gegenüber Evergore.'
        );
    }

    init();
})();
