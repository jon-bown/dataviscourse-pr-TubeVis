/*
 * Shared data helpers for the TubeVis pages (requires D3 v7).
 *
 * - Station name matching: the TfL CSVs spell station names in several different
 *   ways ("Acton Town", "ActonTown", "Bank/Monument", "Edgware Road (Cir)", ...).
 *   `TubeData.stationIndex(stations)` returns a resolver that maps any of those
 *   spellings to the station key(s) used in stations.json.
 * - Yearly entry/exit counts: the column headers change between years (and some
 *   years have duplicated header names), so the rows are read by column position.
 */
(function (global) {
    'use strict';

    const normalizeName = name => (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Normalised CSV spellings that don't map 1:1 onto a stations.json key/title.
    const ALIASES = {
        bankmonument: ['Bank', 'Monument'],
        edgwareroadcir: ['EdgwareRoad'],
        hammersmithdis: ['Hammersmith'],
        shepherdsbushcen: ['ShepardsBush'],
        greatportlandstree: ['GreatPortlandStreet'],
    };

    /**
     * Build a resolver: (csvStationName) => array of stations.json keys (possibly empty).
     */
    function stationIndex(stations) {
        const index = new Map();
        Object.keys(stations).forEach(key => {
            index.set(normalizeName(key), [key]);
            if (stations[key].title) index.set(normalizeName(stations[key].title), [key]);
        });
        Object.entries(ALIASES).forEach(([alias, keys]) => {
            if (!index.has(alias)) index.set(alias, keys.filter(k => k in stations));
        });
        return name => index.get(normalizeName(name)) || [];
    }

    const COUNT_YEARS = ['2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014', '2015', '2016'];

    const toNumber = value => {
        if (value === undefined || value === null) return NaN;
        const cleaned = String(value).replace(/[,\s]/g, '');
        return cleaned === '' ? NaN : +cleaned;
    };

    /**
     * Load a yearly entry/exit count file. Resolves to an array of
     * {year, station, nlc, entry_week, entry_saturday, entry_sunday,
     *  exit_week, exit_saturday, exit_sunday, million}
     */
    async function loadCounts(year) {
        const text = await d3.text(`tubedata/counts/${year}_Entry_Exit.csv`);
        const rows = d3.csvParseRows(text.replace(/^[\r\n]+/, ''));
        const header = rows.shift().map(h => h.trim().toLowerCase());
        // Columns after "note" are: entry week/sat/sun, exit week/sat/sun, million
        const first = header.indexOf('note') + 1;
        return rows
            .filter(r => r.length > first && r[1] && r[1].trim())
            .map(r => ({
                year,
                nlc: r[0],
                station: r[1].trim(),
                entry_week: toNumber(r[first]),
                entry_saturday: toNumber(r[first + 1]),
                entry_sunday: toNumber(r[first + 2]),
                exit_week: toNumber(r[first + 3]),
                exit_saturday: toNumber(r[first + 4]),
                exit_sunday: toNumber(r[first + 5]),
                million: toNumber(r[first + 6]),
            }));
    }

    global.TubeData = {normalizeName, stationIndex, loadCounts, toNumber, COUNT_YEARS};
})(window);
