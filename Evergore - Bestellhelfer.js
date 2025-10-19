// ==UserScript==
// @name         Evergore - Bestellhelfer
// @namespace    http://tampermonkey.net/
// @version      0.6.0
// @description  Lese Lagerbestände seitenübergreifend ein, vergleiche mit Sollwerten, bilde Bestellblöcke und speichere kumulativ.
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
        Object.assign(btn.style, {
            position: "fixed", top: "10px", right: "10px",
            zIndex: 1000, padding: "10px", background: "yellow"
        });
        document.body.appendChild(btn);

        let resetBtn = document.createElement("button");
        resetBtn.textContent = "♻ Reset";
        Object.assign(resetBtn.style, {
            position: "fixed", top: "50px", right: "10px",
            zIndex: 1000, padding: "10px", background: "lightcoral"
        });
        document.body.appendChild(resetBtn);

        btn.addEventListener("click", () => {
    const istBestand = {};
    document.querySelectorAll("td.LT .handle label").forEach(label => {
        const parts = label.innerText.trim().split(" ");
        const menge = parseInt(parts[0].replace(/\D/g, ""), 10);
        const name = parts.slice(1).join(" ");
        istBestand[name] = menge;
    });

    // 🔹 vorhandene Daten abrufen
    const alt = GM_getValue("bestellungen", []);
    let merged = [...alt];

    produkte.forEach(p => {
        // Nur berücksichtigen, wenn der Artikel auf dieser Seite vorkommt
        if (istBestand[p.name] === undefined) return;

        const ist = istBestand[p.name];
        const diff = p.soll - ist;

        const existing = merged.find(x => x.name === p.name);

        if (diff > 0) {
            if (existing) {
                // Nur aktualisieren, wenn der neue Wert kleiner (also genauer) ist
                existing.fehlt = Math.min(existing.fehlt, diff);
                existing.preis = p.preis;
            } else {
                merged.push({ name: p.name, preis: p.preis, fehlt: diff });
            }
        } else if (existing) {
            // Wenn kein Fehlbedarf mehr -> entfernen
            merged = merged.filter(x => x.name !== p.name);
        }
    });

    GM_setValue("bestellungen", merged);
    btn.style.background = "limegreen";
    console.log("📦 Eingelesene Bestände (kumulativ, korrekt kombiniert):", merged);
});

        resetBtn.addEventListener("click", () => {
            GM_setValue("bestellungen", []);
            GM_setValue("hiddenBlocks", []);
            resetBtn.style.background = "green";
            console.log("🔄 Daten wurden komplett zurückgesetzt.");
        });
    }

    // --- Market Booth ---
    if (location.href.includes("market_booth")) {
        const bestellungen = GM_getValue("bestellungen", []);
        if (bestellungen.length === 0) return;

        let blocks = [];
        let currentBlock = { produkte: [], summe: 0 };

        bestellungen.forEach(p => {
            let rest = p.fehlt;
            while (rest > 0) {
                let platzMenge = Math.floor((MAX_BLOCK - currentBlock.summe) / p.preis);
                if (platzMenge <= 0) {
                    blocks.push(currentBlock);
                    currentBlock = { produkte: [], summe: 0 };
                    continue;
                }
                let menge = Math.min(rest, platzMenge);
                let kosten = menge * p.preis;
                let existing = currentBlock.produkte.find(x => x.name === p.name);
                if (existing) {
                    existing.menge += menge;
                    existing.summe += kosten;
                } else {
                    currentBlock.produkte.push({ name: p.name, menge, preis: p.preis, summe: kosten });
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

        // 🔹 Overlay
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "50px", right: "10px", zIndex: 9999,
            background: "white", border: "2px solid black", padding: "10px",
            maxHeight: "90vh", overflow: "auto", fontSize: "14px"
        });
        document.body.appendChild(overlay);

        const table = document.createElement("table");
        Object.assign(table.style, { borderCollapse: "collapse", width: "100%", border: "1px solid black" });
        table.innerHTML = `<tr style="border-bottom:1px solid black; background:#eee;">
            <th>✔</th><th colspan="2">Lagerbestellungen</th></tr>`;
        overlay.appendChild(table);

        let hiddenBlocks = GM_getValue("hiddenBlocks", []);

        blocks.forEach((block, idx) => {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid black";
            const produkteText = block.produkte.map(p => `${p.name} (${p.menge}×${p.preis})`).join("<br>");
            row.innerHTML = `<td><input type="checkbox" data-idx="${idx}" ${hiddenBlocks.includes(idx) ? "" : "checked"}></td>
                             <td>${produkteText}</td><td class="sum">${block.summe}</td>`;
            if (hiddenBlocks.includes(idx)) row.style.display = "none";
            table.appendChild(row);
        });

        const sumRow = document.createElement("tr");
        sumRow.style.borderTop = "2px solid black";
        sumRow.innerHTML = `<td colspan="2"><b>Gesamtsumme:</b></td><td id="gesamt"></td>`;
        table.appendChild(sumRow);

        overlay.appendChild(table);

        function updateSumme() {
            let sum = 0;
            overlay.querySelectorAll("tr").forEach(tr => {
                if (tr.style.display !== "none") {
                    const cell = tr.querySelector(".sum");
                    if (cell) sum += parseInt(cell.textContent, 10);
                }
            });
            document.getElementById("gesamt").textContent = sum;
        }
        updateSumme();

        overlay.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.addEventListener("change", e => {
                const idx = parseInt(e.target.dataset.idx, 10);
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
