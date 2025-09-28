// ==UserScript==
// @name         Evergore - Bestellhelfer
// @namespace    http://tampermonkey.net/
// @version      0.5.6
// @description  Markt-Helfer für Evergore (optimierte Blockbildung mit Produktbündelung & Reset)
// @author       Vestri mit KI
// @match        https://evergore.de/lenoran?page=stock_out*
// @match        https://evergore.de/lenoran?page=market_booth*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const produkte = [
        { name: "Schmiedeöl", soll: 100, preis: 50 },
        { name: "Bogensalbe", soll: 100, preis: 50 },
        { name: "Harz", soll: 100, preis: 100 },
        { name: "Zwirn", soll: 100, preis: 100 },
        { name: "Steinkohle", soll: 100, preis: 100 },
        { name: "Nähgarn", soll: 100, preis: 50 },
        { name: "Lederfett", soll: 100, preis: 50 },
        { name: "Magiesplitter", soll: 100, preis: 50 },
        { name: "Federn", soll: 100, preis: 25 },
        { name: "Salz", soll: 100, preis: 100 },
        { name: "Mörtel", soll: 100, preis: 80 },
        { name: "Sägeblatt", soll: 100, preis: 200 },
        { name: "Schleifstein", soll: 100, preis: 400 },
        { name: "Elbenhaar", soll: 100, preis: 400 },
        { name: "Wattierung", soll: 100, preis: 400 },
        { name: "Granitharz", soll: 100, preis: 150 },
        { name: "Glaszwirn", soll: 100, preis: 150 },
        { name: "Drachenzunder", soll: 100, preis: 150 },
        { name: "Schutzpolster", soll: 100, preis: 400 },
        { name: "Ledernieten", soll: 100, preis: 400 },
        { name: "Phasenkraut", soll: 100, preis: 400 },
        { name: "Pfeilharz", soll: 100, preis: 400 },
        { name: "Kristallat", soll: 100, preis: 150 },
        { name: "Edelmörtel", soll: 100, preis: 180 },
        { name: "Beschläge", soll: 100, preis: 2000 },
        { name: "Drachinschneiden", soll: 100, preis: 2000 },
        { name: "Erdenblut", soll: 100, preis: 2000 },
        { name: "Griffband", soll: 100, preis: 2000 },
        { name: "Nieten", soll: 100, preis: 2000 },
        { name: "Vulkandraht", soll: 100, preis: 2000 }
    ];

    const MAX_BLOCK = 50000;

    // --- Stock Out ---
    if (location.href.includes("stock_out")) {
        let btn = document.createElement("button");
        btn.textContent = "📥 Bestände einlesen";
        btn.style.position = "fixed";
        btn.style.top = "10px";
        btn.style.right = "10px";
        btn.style.zIndex = 1000;
        btn.style.padding = "10px";
        btn.style.background = "yellow";
        document.body.appendChild(btn);

        let resetBtn = document.createElement("button");
        resetBtn.textContent = "♻ Reset";
        resetBtn.style.position = "fixed";
        resetBtn.style.top = "50px";
        resetBtn.style.right = "10px";
        resetBtn.style.zIndex = 1000;
        resetBtn.style.padding = "10px";
        resetBtn.style.background = "lightcoral";
        document.body.appendChild(resetBtn);

        btn.addEventListener("click", () => {
            const istBestand = {};
            document.querySelectorAll("td.LT .handle label").forEach(label => {
                let parts = label.innerText.trim().split(" ");
                let menge = parseInt(parts[0].replace(/\D/g, ""), 10);
                let name = parts.slice(1).join(" ");
                btn.style.background = "green";
                istBestand[name] = menge;
            });

            let bestellungen = [];
            produkte.forEach(p => {
                let ist = istBestand[p.name] || 0;
                let diff = p.soll - ist;
                if (diff > 0) {
                    bestellungen.push({
                        name: p.name,
                        preis: p.preis,
                        fehlt: diff
                    });
                }
            });

            GM_setValue("bestellungen", bestellungen);

            console.log("📦 Eingelesene Bestände:", istBestand);
            console.log("📝 Fehlende Produkte:", bestellungen);
        });

        resetBtn.addEventListener("click", () => {
            GM_setValue("bestellungen", []);
            GM_setValue("hiddenBlocks", []);
            resetBtn.style.background = "green";
          //  alert("🔄 Daten wurden zurückgesetzt!");
        });
    }

    // --- Market Booth ---
    if (location.href.includes("market_booth")) {
        let bestellungen = GM_getValue("bestellungen", []);
        if (bestellungen.length === 0) return;

        // 🔹 Optimierte Blockbildung
        let blocks = [];
        let currentBlock = { produkte: [], summe: 0 };

        bestellungen.forEach(p => {
            let rest = p.fehlt;
            while (rest > 0) {
                let maxMenge = Math.floor(MAX_BLOCK / p.preis);
                let platzMenge = Math.floor((MAX_BLOCK - currentBlock.summe) / p.preis);

                if (platzMenge <= 0) {
                    if (currentBlock.produkte.length > 0) blocks.push(currentBlock);
                    currentBlock = { produkte: [], summe: 0 };
                    continue;
                }

                let menge = Math.min(rest, platzMenge, maxMenge);
                let kosten = menge * p.preis;

                let existing = currentBlock.produkte.find(x => x.name === p.name && x.preis === p.preis);
                if (existing) {
                    existing.menge += menge;
                    existing.summe += kosten;
                } else {
                    currentBlock.produkte.push({
                        name: p.name,
                        menge: menge,
                        preis: p.preis,
                        summe: kosten
                    });
                }

                currentBlock.summe += kosten;
                rest -= menge;

                if (currentBlock.summe >= MAX_BLOCK) {
                    blocks.push(currentBlock);
                    currentBlock = { produkte: [], summe: 0 };
                }
            }
        });
        if (currentBlock.produkte.length > 0) blocks.push(currentBlock);

        // --- Overlay ---
        const overlay = document.createElement("div");
        overlay.style.position = "fixed";
        overlay.style.top = "50px";
        overlay.style.right = "10px";
        overlay.style.zIndex = 9999;
        overlay.style.background = "white";
        overlay.style.border = "2px solid black";
        overlay.style.padding = "10px";
        overlay.style.maxHeight = "90vh";
        overlay.style.overflow = "auto";
        overlay.style.fontSize = "14px";
        document.body.appendChild(overlay);

        const table = document.createElement("table");
        table.style.borderCollapse = "collapse";
        table.style.width = "100%";
        table.style.border = "1px solid black";

        table.innerHTML = `
            <tr style="border-bottom:1px solid black; background:#eee;">
              <th>✔</th>
              <th>Produkt(e)</th>
              <th>Summe</th>
            </tr>
        `;

        let hiddenBlocks = GM_getValue("hiddenBlocks", []);

        blocks.forEach((block, idx) => {
            let row = document.createElement("tr");
            row.style.borderBottom = "1px solid black";

            let produkteText = block.produkte.map(p => `${p.name} (${p.menge}×${p.preis})`).join("<br>");
            row.innerHTML = `
                <td><input type="checkbox" data-idx="${idx}" ${hiddenBlocks.includes(idx) ? "" : "checked"}></td>
                <td>${produkteText}</td>
                <td class="sum">${block.summe}</td>
            `;
            if (hiddenBlocks.includes(idx)) row.style.display = "none";
            table.appendChild(row);
        });

        let sumRow = document.createElement("tr");
        sumRow.style.borderTop = "2px solid black";
        sumRow.innerHTML = `<td colspan="2"><b>Gesamtsumme:</b></td><td id="gesamt"></td>`;
        table.appendChild(sumRow);

        overlay.appendChild(table);

        function updateSumme() {
            let sum = 0;
            overlay.querySelectorAll("tr").forEach(tr => {
                if (tr.style.display !== "none") {
                    let cell = tr.querySelector(".sum");
                    if (cell) sum += parseInt(cell.textContent, 10);
                }
            });
            document.getElementById("gesamt").textContent = sum;
        }
        updateSumme();

        overlay.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.addEventListener("change", e => {
                let idx = parseInt(e.target.dataset.idx, 10);
                if (e.target.checked) {
                    hiddenBlocks = hiddenBlocks.filter(i => i !== idx);
                    e.target.closest("tr").style.display = "";
                } else {
                    if (!hiddenBlocks.includes(idx)) hiddenBlocks.push(idx);
                    e.target.closest("tr").style.display = "none";
                }
                GM_setValue("hiddenBlocks", hiddenBlocks);
                updateSumme();
            });
        });
    }
})();
