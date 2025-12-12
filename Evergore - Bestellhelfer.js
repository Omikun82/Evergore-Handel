// ==UserScript==
// @name         Evergore - Bestellhelfer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Saubere Multi-Page-Bestelllogik mit Soll/Ist-Abgleich, NULL-Markierung, Blockbildung und Overlay.
// @author       Vestri mit KI
// @match        https://evergore.de/lenoran?page=stock_out*
// @match        https://evergore.de/lenoran?page=market_booth*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const produkte = [
        { name: "Schmiedeöl", soll: 2500, preis: 50 },
        { name: "Bogensalbe", soll: 750, preis: 50 },
        { name: "Harz", soll: 250, preis: 100 },
        { name: "Zwirn", soll: 250, preis: 100 },
        { name: "Steinkohle", soll: 250, preis: 100 },
        { name: "Nähgarn", soll: 1200, preis: 50 },
        { name: "Lederfett", soll: 1500, preis: 50 },
        { name: "Magiesplitter", soll: 2000, preis: 50 },
        { name: "Federn", soll: 1500, preis: 25 },
        { name: "Salz", soll: 450, preis: 100 },
        { name: "Mörtel", soll: 250, preis: 80 },
        { name: "Sägeblatt", soll: 45, preis: 200 },
        { name: "Edelsteinpolitur", soll: 1, preis: 5000 },
        { name: "Schleifstein", soll: 300, preis: 400 },
        { name: "Elbenhaar", soll: 125, preis: 400 },
        { name: "Wattierung", soll: 150, preis: 400 },
        { name: "Granitharz", soll: 350, preis: 150 },
        { name: "Glaszwirn", soll: 300, preis: 150 },
        { name: "Drachenzunder", soll: 300, preis: 150 },
        { name: "Schutzpolster", soll: 200, preis: 400 },
        { name: "Ledernieten", soll: 375, preis: 400 },
        { name: "Phasenkraut", soll: 500, preis: 400 },
        { name: "Pfeilharz", soll: 50, preis: 400 },
        { name: "Kristallat", soll: 400, preis: 150 },
        { name: "Edelmörtel", soll: 200, preis: 180 },
        { name: "Griffband", soll: 75, preis: 2000 },
        { name: "Nieten", soll: 75, preis: 2000 },
        { name: "Vulkandraht", soll: 75, preis: 2000 },
        { name: "Beschläge", soll: 100, preis: 2000 },
        { name: "Erdenblut", soll: 75, preis: 2000 },
        { name: "Drachinschneiden", soll: 0, preis: 2000 }
    ];

    const MAX_BLOCK = 50000;

    // -----------------------------
    // STOCK OUT – Einlesen
    // -----------------------------
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

            let speicher = GM_getValue("bestellungen", {});
            const istBestand = {};

            // --- IST-Werte der Seite lesen ---
            document.querySelectorAll("td.LT .handle label").forEach(label => {
                const parts = label.innerText.trim().split(" ");
                const menge = parseInt(parts[0].replace(/\D/g, ""), 10);
                const name = parts.slice(1).join(" ");
                istBestand[name] = menge;
            });

            // --- Für alle Produkte verarbeiten ---
            produkte.forEach(p => {
                const ist = istBestand[p.name];

                // 1) IST-Wert vorhanden → Fehl berechnen
                if (ist !== undefined) {

                    if (speicher[p.name] !== undefined) {
                        // Fehl = gespeicherter Fehl – Ist
                        let neu = speicher[p.name] - ist;
                        if (neu <= 0) neu = null;
                        speicher[p.name] = neu;
                    } else {
                        // Fehl = Soll – Ist
                        let neu = p.soll - ist;
                        if (neu <= 0) neu = null;
                        speicher[p.name] = neu;
                    }
                }

                // 2) Kein IST-Wert und Produkt noch nie gesehen → Komplettbedarf
                else if (speicher[p.name] === undefined) {
                    speicher[p.name] = p.soll;
                }
                // 3) Kein IST, aber Speicher existiert → Wert bleibt (NULL oder Zahl)
            });

            GM_setValue("bestellungen", speicher);
            btn.style.background = "limegreen";
            console.log("📦 Neuer Speicher:", speicher);
        });

        resetBtn.addEventListener("click", () => {
            GM_setValue("bestellungen", {});
            GM_setValue("hiddenBlocks", []);
            resetBtn.style.background = "green";
            console.log("🔄 Reset durchgeführt.");
        });
    }

    // -----------------------------
    // MARKET BOOTH – Overlay
    // -----------------------------
    if (location.href.includes("market_booth")) {

        const bestellungen = GM_getValue("bestellungen", {});
        const entries = Object.entries(bestellungen)
            .filter(([name, fehlt]) => fehlt !== null && fehlt > 0)
            .map(([name, fehlt]) => {
                const p = produkte.find(x => x.name === name);
                return { name, fehlt, preis: p ? p.preis : 0 };
            });

        if (entries.length === 0) return;

        let blocks = [];
        let block = { produkte: [], summe: 0 };

        entries.forEach(p => {
            let rest = p.fehlt;

            while (rest > 0) {
                let platz = Math.floor((MAX_BLOCK - block.summe) / p.preis);
                if (platz <= 0) {
                    blocks.push(block);
                    block = { produkte: [], summe: 0 };
                    continue;
                }
                let menge = Math.min(rest, platz);
                let kosten = menge * p.preis;

                let ex = block.produkte.find(x => x.name === p.name);
                if (ex) {
                    ex.menge += menge;
                    ex.summe += kosten;
                } else {
                    block.produkte.push({
                        name: p.name,
                        menge,
                        preis: p.preis,
                        summe: kosten
                    });
                }

                block.summe += kosten;
                rest -= menge;

                if (block.summe >= MAX_BLOCK) {
                    blocks.push(block);
                    block = { produkte: [], summe: 0 };
                }
            }
        });

        if (block.produkte.length > 0) blocks.push(block);

        // --- Overlay ---
        const overlay = document.createElement("div");
        Object.assign(overlay.style, {
            position: "fixed", top: "50px", right: "10px",
            zIndex: 9999, background: "white", border: "2px solid black",
            padding: "10px", maxHeight: "90vh", overflow: "auto",
            fontSize: "14px"
        });
        document.body.appendChild(overlay);

        const table = document.createElement("table");
        Object.assign(table.style, { borderCollapse: "collapse", width: "100%" });

        table.innerHTML = `<tr style="border-bottom:1px solid black; background:#eee;">
            <th>✔</th><th>Block</th><th>Summe</th>
        </tr>`;

        overlay.appendChild(table);

        let hidden = GM_getValue("hiddenBlocks", []);

        blocks.forEach((block, idx) => {
            const row = document.createElement("tr");
            row.style.borderBottom = "1px solid black";
            const produkteText = block.produkte
                .map(p => `${p.name} (${p.menge}×${p.preis})`)
                .join("<br>");

            row.innerHTML = `
                <td><input type="checkbox" data-idx="${idx}" ${hidden.includes(idx) ? "" : "checked"}></td>
                <td>${produkteText}</td>
                <td class="sum">${block.summe}</td>
            `;

            if (hidden.includes(idx)) row.style.display = "none";
            table.appendChild(row);
        });

        const sumRow = document.createElement("tr");
        sumRow.style.borderTop = "2px solid black";
        sumRow.innerHTML = `<td colspan="2"><b>Gesamt:</b></td><td id="gesamt"></td>`;
        table.appendChild(sumRow);

        function updateSum() {
            let s = 0;
            overlay.querySelectorAll(".sum").forEach(c => {
                if (c.parentElement.style.display !== "none")
                    s += parseInt(c.textContent, 10);
            });
            document.getElementById("gesamt").textContent = s;
        }
        updateSum();

        overlay.querySelectorAll("input[type=checkbox]").forEach(cb => {
            cb.addEventListener("change", e => {
                const idx = parseInt(e.target.dataset.idx, 10);
                if (e.target.checked) {
                    hidden = hidden.filter(x => x !== idx);
                    e.target.closest("tr").style.display = "";
                } else {
                    if (!hidden.includes(idx)) hidden.push(idx);
                    e.target.closest("tr").style.display = "none";
                }
                GM_setValue("hiddenBlocks", hidden);
                updateSum();
            });
        });
    }
})();
