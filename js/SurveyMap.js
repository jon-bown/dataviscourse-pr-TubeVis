/*
 * Leaflet overlays for the 2016 RODS survey data (requires Map.js)
 */

const ACCESS_COLUMNS = {
    'NR/DLR/Tram': 'NR/DLR/Tram',
    'Bus/Coach': 'Bus/Coach',
    'Bicycle': 'Bicycle',
    'Motorcycle': 'Motorcycle',
    'Car/Van Parked': 'Car/VanParked',
    'Car/Van driven away': 'Car/Vandrivenaway',
    'Walked': 'Walked',
    'Taxi/ Minicab': 'Taxi/Minicab',
    'RiverBus/Ferry': 'RiverBus/Ferry',
    'Other': 'Other',
    'Heathrow Terminal 1': 'Heathrow_Terminal_1',
    'Heathrow Terminal 2': 'Heathrow_Terminal_2',
    'Heathrow Terminal 3': 'Heathrow_Terminal_3',
    'Heathrow Terminal 4': 'Heathrow_Terminal_4',
    'Heathrow Terminal 5': 'Heathrow_Terminal_5',
};

const JOURNEY_TIME_COLUMNS = {
    'Average': 'Average',
    '< 15 mins': 'l_15_mins',
    '15 - 30': 'f15_30',
    '30 - 45': 'f30_45',
    '45 - 60': 'f45_60',
    '60 - 90': 'f60_90',
    'over 90': 'over_90',
};

const menuValue = id => {
    const el = document.getElementById(id);
    return el ? el.value : '';
};

// Bubble size relative to the mean of the values (as in the original project)
const relativeTo = (divisor, adjust = c => c) => values => {
    const change = adjust(d3.mean(values, v => v / divisor));
    return v => v / change;
};

/*
 * One entry per survey statistic:
 *  file     - CSV to read
 *  period   - column holding the time period (filtered with the "dayMenu"), if any
 *  value    - (row, menus) => number for the selected category
 *  radius   - values => (value => circle radius in metres)
 */
const SURVEYS = {
    avtime: {
        file: 'tubedata/RODS_2016/Exit/Average journey time/station.csv',
        period: 'Time_period',
        value: (row, m) => +row[JOURNEY_TIME_COLUMNS[m.category]],
        radius: relativeTo(100),
    },
    distancekm: {
        file: 'tubedata/RODS_2016/Entry/Distance_travelled/By_station.csv',
        value: (row, m) => {
            const column = {'<1 km': 'l1km', '30+ kms': '30pkms'}[m.category] || m.category;
            return +row[column] / +row.Total;
        },
        radius: () => v => v * 10000,
    },
    avdistance: {
        file: 'tubedata/RODS_2016/Exit/Distance travelled/Totals.csv',
        // "Total passenger kilometres" -> Total_passenger_kilometres, "Average journey length (kms)" -> Average_journey_length
        value: (row, m) => +row[m.category.split(' ').slice(0, 3).join('_')],
        radius: relativeTo(500),
    },
    access: {
        file: 'tubedata/RODS_2016/Entry/Access mode/Access.csv',
        period: 'Time_period',
        value: (row, m) => +row[ACCESS_COLUMNS[m.category]],
        radius: values => {
            const scale = relativeTo(90, c => c < 0.05 ? 0.1 : c)(values);
            return v => scale(v) * 5;
        },
    },
    purpose: {
        file: 'tubedata/RODS_2016/Entry/Journey purpose/journey purpose.csv',
        period: 'Time period',
        value: (row, m) => {
            if (m.place === 'Destination Purpose') return +row['D' + m.category];
            // Origin "Work" and "Home" are split over two columns
            if (m.category === 'Work' || m.category === 'Home') return +row[m.category + '1'] + +row[m.category + '2'];
            return +row[m.category];
        },
        radius: relativeTo(80, c => c < 0.05 ? 0.1 : (c > 10 && c < 100 ? 100 : c)),
    },
};

class SurveyMap extends OverlayMap {

    /**
     * @param map Leaflet map instance
     * @param stations stations.json "stations" object
     */
    constructor(map, stations) {
        super(map);
        this.stations = stations;
        this.resolve = TubeData.stationIndex(stations);
        this.csvCache = new Map();
    }

    loadCsv(file) {
        if (!this.csvCache.has(file)) {
            // Trim header names and cell values; the RODS exports are padded with spaces
            this.csvCache.set(file, d3.csv(file, row => {
                const clean = {};
                Object.entries(row).forEach(([k, v]) => { clean[k.trim()] = typeof v === 'string' ? v.trim() : v; });
                return clean;
            }));
        }
        return this.csvCache.get(file);
    }

    /** Resolves to [{title, lat, lng, value}] for the selected survey statistic */
    async stationValues(type) {
        const survey = SURVEYS[type];
        const menus = {category: menuValue('categoryMenu'), day: menuValue('dayMenu'), place: menuValue('placeMenu')};
        if (!survey || !menus.category || (survey.period && !menus.day)) return null;

        const rows = await this.loadCsv(survey.file);
        const valueByKey = new Map();
        rows
            .filter(row => !survey.period || row[survey.period] === menus.day)
            .forEach(row => this.resolve(row.Station).forEach(key => {
                if (!valueByKey.has(key)) valueByKey.set(key, survey.value(row, menus));
            }));

        return Object.entries(this.stations)
            .filter(([key, s]) => s.position && Number.isFinite(valueByKey.get(key)))
            .map(([key, s]) => ({title: s.title.trim(), lat: s.position.lat, lng: s.position.lon, value: valueByKey.get(key)}));
    }

    async setCircles(map, type) {
        const id = this.nextRequest();
        const values = await this.stationValues(type);
        if (!values || !this.isCurrent(id)) return;
        this.clearMarkers();
        const radius = SURVEYS[type].radius(values.map(d => d.value));
        const format = d3.format(',.3~f');
        this.drawCircles(values.map(d => ({...d, radius: radius(d.value), label: `${d.title}: ${format(d.value)}`})));
    }

    async setHeatmap(map, type) {
        const id = this.nextRequest();
        const values = await this.stationValues(type);
        if (!values || !this.isCurrent(id)) return;
        this.clearMarkers();
        this.drawHeatmap(values.map(d => ({...d, weight: d.value})));
    }
}
