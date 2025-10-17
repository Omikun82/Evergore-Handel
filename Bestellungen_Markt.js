// ==UserScript==
// @name         Bestellungen_Markt
// @namespace    https://evergore.de/
// @version      1.2
// @description  Markt-Bestellhelfer: liest Angebote ein und zeigt Blockempfehlungen (max. 50k Gold pro Block, mit persistenter Ausblendung)
// @author       Vestri with KI
// @match        https://evergore.de/lenoran?page=market_all_articles&selection=30
// @match        https://evergore.de/lenoran?page=market_booth*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = "eg_market_orders_v1";
    const HIDE_KEY = "eg_market_orders_hidden_v1";
    const POS_KEY = "eg_market_orders_pos_v1";

    // --- Konfiguration ---
    const produkte = [
        { name: "Schmiedeöl", soll: 100, preis: 50 },
        { name: "Bogensalbe", soll: 50, preis: 50 },
        { name: "Harz", soll: 100, preis: 100 },
        { name: "Zwirn", soll: 100, preis: 100 },
        { name: "Steinkohle", soll: 50, preis: 100 },
        { name: "Nähgarn", soll: 50, preis: 50 },
        { name: "Lederfett", soll: 100, preis: 50 },
        { name: "Magiesplitter", soll: 100, preis: 50 },
        { name: "Federn", soll: 50, preis: 25 },
        { name: "Salz", soll: 50, preis: 100 },
        { name: "Mörtel", soll: 20, preis: 80 },
        { name: "Sägeblatt", soll: 20, preis: 200 },
        { name: "Schleifstein", soll: 20, preis: 400 },
        { name: "Elbenhaar", soll: 20, preis: 400 },
        { name: "Wattierung", soll: 40, preis: 400 },
        { name: "Granitharz", soll: 40, preis: 150 },
        { name: "Glaszwirn", soll: 20, preis: 150 },
        { name: "Drachenzunder", soll: 20, preis: 150 },
        { name: "Schutzpolster", soll: 20, preis: 400 },
        { name: "Ledernieten", soll: 20, preis: 400 },
        { name: "Phasenkraut", soll: 40, preis: 400 },
        { name: "Pfeilharz", soll: 20, preis: 400 },
        { name: "Kristallat", soll: 20, preis: 150 },
        { name: "Edelmörtel", soll: 20, preis: 180 },
        { name: "Beschläge", soll: 0, preis: 2000 },
        { name: "Drachinschneiden", soll: 0, preis: 2000 },
        { name: "Erdenblut", soll: 20, preis: 2000 },
        { name: "Griffband", soll: 0, preis: 2000 },
        { name: "Nieten", soll: 10, preis: 2000 },
        { name: "Vulkandraht", soll: 0, preis: 2000 }
    ];

    // ========================================
    // === 1️⃣ Marktseite (Datenerfassung)
    // ========================================
    if (location.href.includes("market_all_articles")) {
        window.addEventListener("load", () => {
            const menu = document.querySelector("table")?.parentElement;
            if (!menu) return;

            const btnLoad = document.createElement("button");
            btnLoad.textContent = "Daten laden";
            btnLoad.style.margin = "5px";
            const btnReset = document.createElement("button");
            btnReset.textContent = "Reset";
            btnReset.style.margin = "5px";

            menu.prepend(btnReset);
            menu.prepend(btnLoad);

            btnLoad.addEventListener("click", () => {
                const rows = [...document.querySelectorAll("table tbody tr")].filter(tr => tr.querySelector("b"));
                const items = {};

                for (let tr of rows) {
                    const nameEl = tr.querySelector("b");
                    if (!nameEl) continue;
                    const raw = nameEl.textContent.trim();
                    const name = raw.replace(/^\d+\s*/, "").trim();
                    const qtyMatch = raw.match(/^(\d+)\s/);
                    const menge = qtyMatch ? parseInt(qtyMatch[1]) : 0;
                    const preisText = tr.querySelector(".R")?.innerText.match(/([\d.,]+)\s*Gold/);
                    const preis = preisText ? parseFloat(preisText[1].replace(",", ".")) : 0;
                    if (!items[name]) items[name] = { name, gesamtMenge: 0, preis };
                    items[name].gesamtMenge += menge;
                }

                localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
                alert("Marktdaten gespeichert (" + Object.keys(items).length + " Einträge).");
            });

            btnReset.addEventListener("click", () => {
                localStorage.removeItem(STORAGE_KEY);
                localStorage.removeItem(HIDE_KEY);
                alert("Marktdaten & ausgeblendete Blöcke gelöscht.");
            });
        });
    }

    // ========================================
    // === 2️⃣ Kaufseite (Overlay)
    // ========================================
    if (location.href.includes("market_booth")) {
        window.addEventListener("load", () => {
            const dataRaw = localStorage.getItem(STORAGE_KEY);
            if (!dataRaw) return;
            let marktDaten;
            try { marktDaten = JSON.parse(dataRaw); } catch { return; }

            const hiddenRaw = localStorage.getItem(HIDE_KEY);
            const hiddenBlocks = hiddenRaw ? JSON.parse(hiddenRaw) : [];

            const fehlende = [];
            for (const p of produkte) {
                const ist = marktDaten[p.name]?.gesamtMenge || 0;
                const fehlt = Math.max(p.soll - ist, 0);
                if (fehlt > 0 && p.soll > 0)
                    fehlende.push({ name: p.name, fehlt, preis: p.preis });
            }

            // --- Blockbildung bis max. 50k Gold ---
            const bloecke = [];
            let aktuellerBlock = [];
            let aktuellerWert = 0;
            const maxWert = 50000;

            for (let i = 0; i < fehlende.length; i++) {
                const art = fehlende[i];
                const gesamtpreis = art.fehlt * art.preis;
                if (aktuellerWert + gesamtpreis > maxWert && aktuellerBlock.length > 0) {
                    bloecke.push(aktuellerBlock);
                    aktuellerBlock = [];
                    aktuellerWert = 0;
                }
                aktuellerBlock.push(art);
                aktuellerWert += gesamtpreis;
            }
            if (aktuellerBlock.length > 0) bloecke.push(aktuellerBlock);

            // --- Overlay aufbauen ---
            const pos = JSON.parse(localStorage.getItem(POS_KEY) || '{"top":20,"right":20}');
            const overlay = document.createElement("div");
            overlay.style.position = "fixed";
            overlay.style.top = pos.top + "px";
            overlay.style.right = pos.right + "px";
            overlay.style.width = "360px";
            overlay.style.maxHeight = "85vh";
            overlay.style.overflowY = "auto";
            overlay.style.background = "rgba(255,255,255,0.95)";
            overlay.style.border = "2px solid #666";
            overlay.style.borderRadius = "10px";
            overlay.style.padding = "10px";
            overlay.style.fontSize = "13px";
            overlay.style.color = "#000";
            overlay.style.zIndex = 99999;
            overlay.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
            overlay.style.cursor = "default";
            overlay.innerHTML = `<h3 style="text-align:center;margin:0 0 10px;cursor:move;">📦 Marktbestellungen</h3>`;

            // --- Drag & Drop ---
            const header = overlay.querySelector("h3");
            let isDragging = false, startX, startY, startTop, startRight;

            header.addEventListener("mousedown", e => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                startTop = overlay.offsetTop;
                startRight = parseInt(window.getComputedStyle(overlay).right);
                overlay.style.opacity = 0.8;
                e.preventDefault();
            });

            document.addEventListener("mousemove", e => {
                if (!isDragging) return;
                const dy = e.clientY - startY;
                const dx = e.clientX - startX;
                overlay.style.top = startTop + dy + "px";
                overlay.style.right = Math.max(0, startRight - dx) + "px";
            });

            document.addEventListener("mouseup", () => {
                if (!isDragging) return;
                isDragging = false;
                overlay.style.opacity = 1;
                localStorage.setItem(POS_KEY, JSON.stringify({
                    top: parseInt(overlay.style.top),
                    right: parseInt(overlay.style.right)
                }));
            });

            // --- Inhalt füllen ---
            bloecke.forEach((block, idx) => {
                const blockId = "markt_block_" + idx;
                const summe = block.reduce((a, b) => a + b.fehlt * b.preis, 0);
                const div = document.createElement("div");
                div.id = blockId;
                div.style.marginBottom = "8px";
                div.style.padding = "5px";
                div.style.borderBottom = "1px solid #ccc";
                div.innerHTML = `
                    <label style="font-weight:bold;display:block;">
                        <input type="checkbox" ${hiddenBlocks.includes(blockId) ? "checked" : ""}> Block ${idx + 1} – ~${summe.toLocaleString()} Gold
                    </label>
                    <div style="margin-left:15px;${hiddenBlocks.includes(blockId) ? "display:none;" : ""}">
                        ${block.map(x => `${x.fehlt} × ${x.name}`).join("<br>")}
                    </div>
                `;
                const cb = div.querySelector("input");
                cb.addEventListener("change", () => {
                    const listDiv = div.querySelector("div");
                    if (cb.checked) {
                        listDiv.style.display = "none";
                        if (!hiddenBlocks.includes(blockId)) hiddenBlocks.push(blockId);
                    } else {
                        listDiv.style.display = "block";
                        const i = hiddenBlocks.indexOf(blockId);
                        if (i > -1) hiddenBlocks.splice(i, 1);
                    }
                    localStorage.setItem(HIDE_KEY, JSON.stringify(hiddenBlocks));
                });
                overlay.appendChild(div);
            });

            document.body.appendChild(overlay);
        });
    }

})();