// ==UserScript==
// @name         Evergore - Handelslogger
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Loggt Handelsmeldungen (Preisaufschlag, Rabatt, Unbeeindruckt) inkl. Volumen in CSV + Tagesstatistik
// @author       Vestri mit KI
// @match        https://evergore.de/lenoran?page=market_sell*
// @match        https://evergore.de/lenoran?page=market_booth*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // -------------------------
    // Storage-Key + Initialdaten
    // -------------------------
    const STORAGE_KEY = "eg_trade_log_v1";
    let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");

    if (!data.logs) data.logs = [];
    if (!data.counters) data.counters = { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswertGesamt: 0 };
    if (!data.daily) data.daily = {};

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function formatDateTime(dt) {
        return dt.toLocaleString("de-DE");
    }
    function formatDate(dt) {
        return dt.toLocaleDateString("de-DE");
    }
    function parseNumberFromString(s) {
        // entfernt alles außer Ziffern und gibt Zahl zurück (tausenderpunkte möglich)
        return parseInt(String(s).replace(/\D/g, ""), 10) || 0;
    }
    function formatPercent(value) {
        // value ist Zahl wie 13.856 -> wir wollen "13,9%"
        return (Number(value).toFixed(1).replace(".", ",")) + "%";
    }

    // -------------------------
    // Update-Counters / Tagesdaten
    // -------------------------
    function updateCounters(type, wert, volumen) {
        const today = formatDate(new Date());
        if (!data.daily[today]) data.daily[today] = { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswert: 0 };

        if (type === "Preisaufschlag") {
            data.counters.aufschlag = (data.counters.aufschlag || 0) + 1;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].aufschlag++;
            data.daily[today].handelswert += volumen;
        } else if (type === "Rabatt") {
            data.counters.rabatt = (data.counters.rabatt || 0) + 1;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].rabatt++;
            data.daily[today].handelswert += volumen;
        } else if (type === "Unbeeindruckt") {
            data.counters.unbeeindruckt = (data.counters.unbeeindruckt || 0) + 1;
            data.counters.handelswertGesamt += volumen;
            data.daily[today].unbeeindruckt++;
            data.daily[today].handelswert += volumen;
        }

        saveData();
    }

    // -------------------------
    // Log-Eintrag für Aufschlag/Rabatt
    // -------------------------
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

    // -------------------------
    // Parser: läuft die font.CB-Zeilen sequentiell durch
    // -------------------------
    function parseNotesContainer() {
        const container = document.querySelector("div.eg-notes");
        if (!container) return;

        const fonts = Array.from(container.querySelectorAll("font.CB"));
        // currentVolumen sammelt alle 'für X Gold verkauft/gekauft' bis zur nächsten Meldung
        let currentVolumen = 0;

        for (const el of fonts) {
            const text = el.innerText.trim();

            // 1) Verkauf / Kauf Zeile -> aufsummieren
            // Beispiel: "Ihr habt 39 Schwarze Schminke für 156 Gold verkauft."
            let saleMatch = text.match(/für\s+([\d.]+)\s+Gold/i);
            if (saleMatch && /verkauft|gekauft/i.test(text)) {
                const gold = parseNumberFromString(saleMatch[1]);
                currentVolumen += gold;
                continue; // zur nächsten Zeile
            }

            // 2) Preisaufschlag gefunden -> loggen mit bisher aufsummiertem Volumen
            let aufMatch = text.match(/Preisaufschlag von\s+([\d.]+)\s+Gold/i);
            if (aufMatch) {
                const wert = parseNumberFromString(aufMatch[1]);
                pushLog("Preisaufschlag", wert, currentVolumen);
                updateCounters("Preisaufschlag", wert, currentVolumen);
                currentVolumen = 0; // für den nächsten Block zurücksetzen
                continue;
            }

            // 3) Rabatt gefunden -> loggen mit bisher aufsummiertem Volumen
            let rabMatch = text.match(/Rabatt von\s+([\d.]+)\s+Gold/i);
            if (rabMatch) {
                const wert = parseNumberFromString(rabMatch[1]);
                pushLog("Rabatt", wert, currentVolumen);
                updateCounters("Rabatt", wert, currentVolumen);
                currentVolumen = 0;
                continue;
            }

            // 4) Unbeeindruckt -> nicht in die Detail-Logs, aber Volumen mitnehmen
            if (text.toLowerCase().includes("unbeeindruckt")) {
                // kein pushLog — nur Zähler und Umsatz
                updateCounters("Unbeeindruckt", 0, currentVolumen);
                currentVolumen = 0;
                continue;
            }

            // andere Zeilen: z. B. "Ihr arbeitet zurzeit..." -> ignorieren
        }
    }

    // -------------------------
    // CSV-Export (Detail) + Schlusszeile mit Summen
    // -------------------------
    function downloadCSV() {
        let csv = "Zeit;Typ;Wert;Volumen;Prozent\n";
        for (const e of data.logs) {
            // percent ist schon formatiert inklusive "%"
            csv += `${e.zeit};${e.typ};${e.wert};${e.volumen};${e.percent}\n`;
        }

        const gesamtEvents = (data.counters.unbeeindruckt || 0) + (data.counters.aufschlag || 0) + (data.counters.rabatt || 0);
        const haeufigkeit = gesamtEvents > 0 ? formatPercent(((data.counters.aufschlag || 0) + (data.counters.rabatt || 0)) / gesamtEvents * 100) : formatPercent(0);

        csv += `Unbeeindruckt;Preisaufschlag;Rabatt;Handelswert gesamt;Häufigkeit\n`;
        csv += `${data.counters.unbeeindruckt || 0};${data.counters.aufschlag || 0};${data.counters.rabatt || 0};${data.counters.handelswertGesamt || 0};${haeufigkeit}\n`;

        triggerDownload(csv, "Evergore_Log.csv");
    }

    // -------------------------
    // Tagesstatistik-CSV
    // -------------------------
    function downloadDailyCSV() {
        let csv = "Datum;Unbeeindruckt;Preisaufschlag;Rabatt;Handelswert;Häufigkeit\n";
        // sortiere Datumsschlüssel (optional) für bessere Lesbarkeit
        const dates = Object.keys(data.daily).sort((a, b) => {
            // parse "dd.mm.yyyy" via split
            const pa = a.split('.').reverse().join('-');
            const pb = b.split('.').reverse().join('-');
            return pa.localeCompare(pb);
        });
        for (const d of dates) {
            const stats = data.daily[d];
            const gesamt = (stats.unbeeindruckt || 0) + (stats.aufschlag || 0) + (stats.rabatt || 0);
            const haeufigkeit = gesamt > 0 ? formatPercent(((stats.aufschlag || 0) + (stats.rabatt || 0)) / gesamt * 100) : formatPercent(0);
            csv += `${d};${stats.unbeeindruckt || 0};${stats.aufschlag || 0};${stats.rabatt || 0};${stats.handelswert || 0};${haeufigkeit}\n`;
        }
        triggerDownload(csv, "Evergore_Tagesstatistik.csv");
    }

    function triggerDownload(content, filename) {
        const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    // -------------------------
    // Reset
    // -------------------------
    function resetAll() {
        if (!confirm("Alle gesammelten Handelsdaten wirklich löschen?")) return;
        data = { logs: [], counters: { unbeeindruckt: 0, aufschlag: 0, rabatt: 0, handelswertGesamt: 0 }, daily: {} };
        saveData();
        alert("Daten gelöscht.");
    }

    // -------------------------
    // UI: kleine Box unten rechts
    // -------------------------
    function addButtons() {
        if (document.getElementById("eg-log-box")) return;
        const box = document.createElement("div");
        box.id = "eg-log-box";
        box.style.position = "fixed";
        box.style.bottom = "10px";
        box.style.right = "10px";
        box.style.zIndex = 99999;
        box.style.background = "rgba(255,255,255,0.95)";
        box.style.border = "1px solid #ccc";
        box.style.padding = "6px";
        box.style.borderRadius = "8px";
        box.style.fontSize = "12px";
        box.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";

        const btnDownload = document.createElement("button");
        btnDownload.textContent = "Download CSVs";
        btnDownload.style.marginRight = "6px";
        btnDownload.onclick = () => { downloadCSV(); downloadDailyCSV(); };

        const btnReset = document.createElement("button");
        btnReset.textContent = "Reset";
        btnReset.onclick = resetAll;

        box.appendChild(btnDownload);
        box.appendChild(btnReset);
        document.body.appendChild(box);
    }

    // -------------------------
    // Start/Run
    // -------------------------
    // Daten bereits im localStorage vorhanden -> verwenden
    saveData(); // sicherstellen, dass Struktur vorhanden ist
    parseNotesContainer();
    addButtons();

})();
