// ==UserScript==
// @name         Evergore - Handelslogger (Multiuser-Version)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Loggt Handelsmeldungen (Preisaufschlag, Rabatt, Unbeeindruckt) inkl. Volumen je Benutzer in CSV + Tagesstatistik
// @author       Vestri mit KI
// @match        https://evergore.de/lenoran?page=market_sell*
// @match        https://evergore.de/lenoran?page=market_booth*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ----------------------------------------
    // 🧩 Benutzername aus Seitenkopf ermitteln
    // ----------------------------------------
    function getUserName() {
        // Beispielquelle: <div id="nav2" ...><h2>Vestri</h2>
        const nameEl = document.querySelector('#nav2 h2');
        if (nameEl) {
            return nameEl.textContent.trim();
        }
        return "Unbekannt";
    }

    const userName = getUserName();
    const STORAGE_KEY = "eg_trade_log_v1";

// ----------------------------------------
// 🧠 Feilschen-Stufe + Prozent laden
// ----------------------------------------
async function loadFeilschenInfo() {
    try {
        const response = await fetch("https://evergore.de/lenoran?page=capabilities");
        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, "text/html");

        const rows = Array.from(doc.querySelectorAll("table tr"));
        const row = rows.find(r => r.querySelector("td.L")?.innerText.trim() === "Feilschen");
        if (!row) return { stufe: "?", prozent: "?" };

        const stufe = row.children[2]?.innerText.trim() || "?";
        const prozent = row.querySelector("td.PROGRESS")?.innerText.trim() || "?";

        return { stufe, prozent };
    }
    catch (e) {
        console.error("Fehler beim Laden der Feilschen-Daten:", e);
        return { stufe: "?", prozent: "?" };
    }
}

    // ----------------------------------------
    // 📦 Datenstruktur initialisieren
    // ----------------------------------------
    let allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (!allData[userName]) {
        allData[userName] = {
            logs: [],
            counters: { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswertGesamt: 0 },
            daily: {}
        };
    }
    let data = allData[userName];

    function saveData() {
        allData[userName] = data;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
    }

    // ----------------------------------------
    // 📅 Formatierungs-Helfer
    // ----------------------------------------
    function formatDateTime(dt) {
        return dt.toLocaleString("de-DE");
    }
    function formatDate(dt) {
        return dt.toLocaleDateString("de-DE");
    }
    function parseNumberFromString(s) {
        return parseInt(String(s).replace(/\D/g, ""), 10) || 0;
    }
    function formatPercent(value) {
        return (Number(value).toFixed(1).replace(".", ",")) + "%";
    }

    // ----------------------------------------
    // 🔄 Zähler aktualisieren
    // ----------------------------------------
    function updateCounters(type, wert, volumen) {
        const today = formatDate(new Date());
        if (!data.daily[today])
            data.daily[today] = { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswert: 0 };

        if (type === "Preisaufschlag") {
            data.counters.aufschlag++;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].aufschlag++;
            data.daily[today].handelswert += volumen;
        } else if (type === "Rabatt") {
            data.counters.rabatt++;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].rabatt++;
            data.daily[today].handelswert += volumen;
        } else if (type === "Unbeeindruckt") {
            data.counters.unbeeindruckt++;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].unbeeindruckt++;
            data.daily[today].handelswert += volumen;
        }

        saveData();
    }

    // ----------------------------------------
    // 🪶 Log-Eintrag erstellen
    // ----------------------------------------
    function pushLog(typ, wert, volumen) {
        const now = new Date();
        const percent = volumen > 0 ? formatPercent((wert / volumen) * 100) : formatPercent(0);
        data.logs.push({
            zeit: formatDateTime(now),
            typ: typ,
            wert: wert,
            volumen: volumen,
            percent: percent
        });
        saveData();
    }

    // ----------------------------------------
    // 📖 Handelsmeldungen parsen
    // ----------------------------------------
    function parseNotesContainer() {
        const container = document.querySelector("div.eg-notes");
        if (!container) return;

        const fonts = Array.from(container.querySelectorAll("font.CB"));
        let currentVolumen = 0;

        for (const el of fonts) {
            const text = el.innerText.trim();

            // Verkauf/Kauf
            let saleMatch = text.match(/für\s+([\d.]+)\s+Gold/i);
            if (saleMatch && /verkauft|gekauft/i.test(text)) {
                const gold = parseNumberFromString(saleMatch[1]);
                currentVolumen += gold;
                continue;
            }

            // Preisaufschlag
            let aufMatch = text.match(/Preisaufschlag von\s+([\d.]+)\s+Gold/i);
            if (aufMatch) {
                const wert = parseNumberFromString(aufMatch[1]);
                pushLog("Preisaufschlag", wert, currentVolumen);
                updateCounters("Preisaufschlag", wert, currentVolumen);
                currentVolumen = 0;
                continue;
            }

            // Rabatt
            let rabMatch = text.match(/Rabatt von\s+([\d.]+)\s+Gold/i);
            if (rabMatch) {
                const wert = parseNumberFromString(rabMatch[1]);
                pushLog("Rabatt", wert, currentVolumen);
                updateCounters("Rabatt", wert, currentVolumen);
                currentVolumen = 0;
                continue;
            }

            // Unbeeindruckt
            if (text.toLowerCase().includes("unbeeindruckt")) {
                updateCounters("Unbeeindruckt", 0, currentVolumen);
                currentVolumen = 0;
                continue;
            }
        }
    }

    // ----------------------------------------
    // 📤 CSV-Export
    // ----------------------------------------
    function downloadCSV() {
        let csv = "Zeit;Typ;Wert;Volumen;Prozent\n";
        for (const e of data.logs) {
            csv += `${e.zeit};${e.typ};${e.wert};${e.volumen};${e.percent}\n`;
        }

        const gesamtEvents = data.counters.unbeeindruckt + data.counters.aufschlag + data.counters.rabatt;
        const haeufigkeit = gesamtEvents > 0 ? formatPercent(((data.counters.aufschlag + data.counters.rabatt) / gesamtEvents) * 100) : formatPercent(0);

        csv += `Unbeeindruckt;Preisaufschlag;Rabatt;Handelswert gesamt;Häufigkeit\n`;
        csv += `${data.counters.unbeeindruckt};${data.counters.aufschlag};${data.counters.rabatt};${data.counters.handelswertGesamt};${haeufigkeit}\n`;

        triggerDownload(csv, `Evergore_Log_${userName}.csv`);
    }

    function downloadDailyCSV() {
        let csv = "Datum;Unbeeindruckt;Preisaufschlag;Rabatt;Handelswert;Häufigkeit\n";
        const dates = Object.keys(data.daily).sort((a, b) => {
            const pa = a.split('.').reverse().join('-');
            const pb = b.split('.').reverse().join('-');
            return pa.localeCompare(pb);
        });

        for (const d of dates) {
            const stats = data.daily[d];
            const gesamt = (stats.unbeeindruckt || 0) + (stats.aufschlag || 0) + (stats.rabatt || 0);
            const haeufigkeit = gesamt > 0 ? formatPercent(((stats.aufschlag + stats.rabatt) / gesamt) * 100) : formatPercent(0);
            csv += `${d};${stats.unbeeindruckt};${stats.aufschlag};${stats.rabatt};${stats.handelswert};${haeufigkeit}\n`;
        }

        triggerDownload(csv, `Evergore_Tagesstatistik_${userName}.csv`);
    }

    function triggerDownload(content, filename) {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // ----------------------------------------
    // ♻ Reset-Funktion (nur Benutzer)
    // ----------------------------------------
    function resetAll() {
        if (!confirm(`Alle Handelsdaten von ${userName} löschen?`)) return;
        data = {
            logs: [],
            counters: { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswertGesamt: 0 },
            daily: {}
        };
        saveData();
        alert(`Daten für ${userName} gelöscht.`);
    }

    // ----------------------------------------
    // 🧱 UI unten rechts (Overlay)
    // ----------------------------------------
    async function addButtons() {
        if (document.getElementById("eg-log-box")) return;
        const f = await loadFeilschenInfo();

        const box = document.createElement("div");
        box.id = "eg-log-box";
        box.innerHTML = `
            <div class="logger-header">Logger für ${userName}</div>
            <div class="logger-sub"><center>Stufe ${f.stufe} / ${f.prozent}</center></div>
            <div class="logger-buttons">
                <button id="btnDownload">Download CSVs</button>
                <button id="btnReset">Reset</button>
            </div>
        `;
        document.body.appendChild(box);

        // CSS
        const style = document.createElement("style");
        style.textContent = `
            #eg-log-box {
                position: fixed;
                bottom: 10px;
                right: 10px;
                z-index: 99999;
                background: rgba(255,255,255,0.95);
                border: 1px solid #ccc;
                padding: 6px;
                border-radius: 8px;
                font-size: 12px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.15);
                opacity: 0;
                transition: opacity 1s ease-in-out;
            }
            #eg-log-box.show { opacity: 1; }
            #eg-log-box.fade { opacity: 0.5; }
            #eg-log-box .logger-header {
                font-weight: bold;
                margin-bottom: 4px;
                text-align: center;
            }
            #eg-log-box .logger-buttons {
                display: flex;
                gap: 6px;
                justify-content: center;
            }
            #eg-log-box button {
                background: #f5f5f5;
                border: 1px solid #aaa;
                border-radius: 5px;
                cursor: pointer;
                padding: 2px 6px;
                font-size: 11px;
            }
            #eg-log-box button:hover {
                background: #ddd;
            }
        `;
        document.head.appendChild(style);

        // Button Events
        document.getElementById("btnDownload").onclick = () => { downloadCSV(); downloadDailyCSV(); };
        document.getElementById("btnReset").onclick = resetAll;

        // Sanft einblenden
        setTimeout(() => box.classList.add("show"), 100);

        // Nach 3 Sekunden halbtransparent werden
      //  setTimeout(() => box.classList.add("fade"), 3000);
    }

    // ----------------------------------------
    // 🚀 Start
    // ----------------------------------------
    saveData(); // sicherstellen, dass Struktur vorhanden ist
    parseNotesContainer();
    addButtons();

})();
