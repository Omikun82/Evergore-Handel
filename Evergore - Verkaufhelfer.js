// ==UserScript==
// @name         Evergore - Verkaufhelfer
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Erstellt Verkaufsblöcke aus den Marktitems (max 50k Gold) auf Evergore.de Marktseite
// @author       Vestri with KI
// @match        https://evergore.de/lenoran?page=market_sell
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    window.addEventListener('load', () => {
        // --- Overlay Grundstruktur ---
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "10px";
        overlay.style.right = "10px";
        overlay.style.width = "380px";
        overlay.style.maxHeight = "90vh";
        overlay.style.overflowY = "auto";
        overlay.style.background = "#f9f9f9";   // helles Grau
        overlay.style.color = "#000";           // schwarze Schrift
        overlay.style.padding = "12px";
        overlay.style.fontSize = "16px";        // größere Schrift
        overlay.style.lineHeight = "1.4em";
        overlay.style.zIndex = "9999";
        overlay.style.borderRadius = "8px";
        overlay.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        overlay.innerHTML = "<h3 style='margin-top:0;font-size:18px;'>Verkaufsblöcke</h3>";
        document.body.appendChild(overlay);

        // --- Daten aus Tabelle sammeln ---
        const rows = document.querySelectorAll("tr");
        let items = [];

        rows.forEach(row => {
            const nameEl = row.querySelector("b");
            const priceEl = row.querySelector("td.R");
            if (!nameEl || !priceEl) return;

            let nameRaw = nameEl.textContent.trim();
            let match = nameRaw.match(/^(\d+)\s+(.+)$/);
            if (!match) return;

            let qty = parseInt(match[1], 10);
            let itemName = match[2];

            let priceRaw = priceEl.textContent.trim();
            let price = parseInt(priceRaw.replace(/[^0-9]/g, ""), 10);

            items.push({
                qty,
                name: itemName,
                price,
                total: qty * price
            });
        });

        // --- Items in Blöcke aufteilen (max 50k pro Block, so hoch wie möglich) ---
        let blocks = [];
        let currentBlock = { value: 0, items: [] };

        items.forEach(item => {
            let remainingQty = item.qty;

            while (remainingQty > 0) {
                let spaceLeft = 50000 - currentBlock.value;
                let maxCanTake = Math.floor(spaceLeft / item.price);

                if (maxCanTake <= 0) {
                    // Block voll -> neuen Block beginnen
                    if (currentBlock.items.length > 0) {
                        blocks.push(currentBlock);
                    }
                    currentBlock = { value: 0, items: [] };
                    continue;
                }

                let takeQty = Math.min(maxCanTake, remainingQty);
                currentBlock.items.push({
                    name: item.name,
                    qty: takeQty,
                    price: item.price
                });
                currentBlock.value += takeQty * item.price;
                remainingQty -= takeQty;
            }
        });

        if (currentBlock.items.length > 0) {
            blocks.push(currentBlock);
        }

        // --- Blöcke ins Overlay rendern ---
        blocks.forEach((block, idx) => {
            let blockDiv = document.createElement("div");
            blockDiv.style.border = "1px solid #ccc";
            blockDiv.style.padding = "6px";
            blockDiv.style.marginBottom = "10px";
            blockDiv.style.borderRadius = "6px";
            blockDiv.style.background = "#fff";   // einzelne Box weiß

            let header = document.createElement("label");
            header.style.display = "block";
            header.style.cursor = "pointer";
            header.style.fontWeight = "bold";
            header.style.marginBottom = "4px";

            let cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = true;
            cb.style.marginRight = "8px";
            cb.addEventListener("change", () => {
                blockContent.style.display = cb.checked ? "block" : "none";
            });

            let span = document.createElement("span");
            span.textContent = `Block ${idx + 1} – ${block.value.toLocaleString()} Gold`;

            header.appendChild(cb);
            header.appendChild(span);

            let blockContent = document.createElement("div");
            blockContent.style.marginLeft = "20px";

            block.items.forEach(it => {
                let line = document.createElement("div");
                line.textContent = `${it.qty} × ${it.name} @ ${it.price} Gold`;
                blockContent.appendChild(line);
            });

            blockDiv.appendChild(header);
            blockDiv.appendChild(blockContent);
            overlay.appendChild(blockDiv);
        });
    });
})();
