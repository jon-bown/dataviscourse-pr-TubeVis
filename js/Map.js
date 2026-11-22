/*
 * Leaflet overlays for map.html (requires D3 v7, Leaflet 1.9 and leaflet.heat).
 *
 * OverlayMap holds the shared heatmap / bubble logic. MAP draws the yearly
 * entry & exit counts; SurveyMap (SurveyMap.js) draws the 2016 survey data.
 */

// Cyan -> blue -> magenta -> red, as used by the original Google heatmaps
const HEAT_COLORS = ['rgba(0, 255, 255, 0)',
    '#00FFFF', '#00DFFF', '#00C0FF', '#00A1FF', '#0082FF', '#0062FF', '#0043FF', '#0024FF', '#0005FF',
    '#1A00FF', '#3900FF', '#5800FF', '#7700FF', '#9600FF', '#B600FF', '#D500FF', '#F400FF',
    '#FF00EA', '#FF00CA', '#FF00AB', '#FF008C', '#FF006D', '#FF004E', '#FF002E', '#FF000F', '#FF0000'];

// leaflet.heat wants {stop: color}; spread the colours evenly over 0..1
const toGradient = colors => Object.fromEntries(colors.map((c, i) => [(i / (colors.length - 1)).toFixed(3), c]));

const CUSTOM_GRADIENT = toGradient(HEAT_COLORS);
// Green -> yellow -> red, similar to the Google Maps default heatmap gradient
const DEFAULT_GRADIENT = {0.0: 'rgba(102, 255, 0, 0)', 0.2: 'rgb(102, 255, 0)', 0.5: 'rgb(255, 255, 0)', 1.0: 'rgb(255, 0, 0)'};

const CIRCLE_STYLE = {color: '#FF0000', opacity: 0.8, weight: 1, fillColor: '#FF0000', fillOpacity: 0.25};

class OverlayMap {
    /**
     * @param map Leaflet map instance
     */
    constructor(map) {
        this.map = map;
        //instance of heatmap
        this.heatmap = null;
        //Keeps track of the current layers on the map
        this.markers = [];
        this.radius = 15;
        this.opacity = 0.6;
        this.useCustomGradient = true;
        // Ignore results from requests that were superseded by a newer selection
        this.requestId = 0;
    }

    nextRequest() {
        return ++this.requestId;
    }

    isCurrent(id) {
        return id === this.requestId;
    }

    /**
     * @param points array of {lat, lng, weight}
     */
    drawHeatmap(points) {
        const valid = points.filter(p => Number.isFinite(p.weight) && p.weight > 0);
        this.heatmap = L.heatLayer(valid.map(p => [p.lat, p.lng, p.weight]), {
            radius: this.radius,
            blur: 15,
            // Keep full intensity at the initial city-wide zoom level
            maxZoom: this.map.getZoom(),
            max: d3.max(valid, p => p.weight) || 1,
            gradient: this.useCustomGradient ? CUSTOM_GRADIENT : DEFAULT_GRADIENT,
        }).addTo(this.map);
        this.applyOpacity();
        this.markers.push(this.heatmap);
    }

    /**
     * @param circles array of {lat, lng, radius (metres), label}
     */
    drawCircles(circles) {
        circles
            .filter(c => Number.isFinite(c.radius) && c.radius > 0)
            .forEach(c => {
                const circle = L.circle([c.lat, c.lng], {...CIRCLE_STYLE, radius: c.radius})
                    .bindTooltip(c.label)
                    .addTo(this.map);
                this.markers.push(circle);
            });
    }

    //Clears all markers on the map
    clearMarkers() {
        this.markers.forEach(layer => layer.remove());
        this.markers = [];
        this.heatmap = null;
    }

    changeGradient() {
        this.useCustomGradient = !this.useCustomGradient;
        if (this.heatmap) {
            this.heatmap.setOptions({gradient: this.useCustomGradient ? CUSTOM_GRADIENT : DEFAULT_GRADIENT});
        }
    }

    changeRadius(delta) {
        this.radius = Math.max(1, this.radius + delta);
        if (this.heatmap) this.heatmap.setOptions({radius: this.radius});
        return this.radius;
    }

    //Changes the opacity of the heatmap
    changeOpacity(delta) {
        this.opacity = Math.round(Math.min(1, Math.max(0, this.opacity + delta)) * 10) / 10;
        this.applyOpacity();
        return this.opacity;
    }

    applyOpacity() {
        if (this.heatmap && this.heatmap._canvas) this.heatmap._canvas.style.opacity = this.opacity;
    }

    // Absolute setters for the sliders and toggles on map.html
    setRadius(value) {
        return this.changeRadius(value - this.radius);
    }

    setOpacity(value) {
        return this.changeOpacity(value - this.opacity);
    }

    setGradient(useCustom) {
        if (useCustom !== this.useCustomGradient) this.changeGradient();
    }
}

// Value of a control: the checked radio in a group, or a select's value
const fieldValue = name => {
    const checked = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
    if (checked) return checked.value;
    const el = document.getElementById(name);
    return el && 'value' in el ? el.value : '';
};

/*
 * Yearly entry / exit counts per station
 */
class MAP extends OverlayMap {
    /**
     * @param map Leaflet map instance
     * @param stations stations.json "stations" object
     */
    constructor(map, stations) {
        super(map);
        this.stations = stations;
        this.resolve = TubeData.stationIndex(stations);
        this.countsCache = new Map();
    }

    /** Current selection from the menus, or null if incomplete */
    selection() {
        const type = fieldValue("data-type");   // "ent" | "ext"
        const week = fieldValue("data-week");   // "Week" | "Sat" | "Sun"
        const year = fieldValue("data-year");
        if (!type || !week || !year) return null;
        const day = {Week: 'week', Sat: 'saturday', Sun: 'sunday'}[week];
        return {year, field: `${type === 'ent' ? 'entry' : 'exit'}_${day}`};
    }

    /** Resolves to [{title, lat, lng, value}] for the current selection */
    async stationValues() {
        const sel = this.selection();
        if (!sel) return null;
        if (!this.countsCache.has(sel.year)) this.countsCache.set(sel.year, TubeData.loadCounts(sel.year));
        const rows = await this.countsCache.get(sel.year);

        const valueByKey = new Map();
        rows.forEach(row => this.resolve(row.station).forEach(key => {
            if (!valueByKey.has(key)) valueByKey.set(key, row[sel.field]);
        }));

        return Object.entries(this.stations)
            .filter(([key, s]) => s.position && valueByKey.has(key))
            .map(([key, s]) => ({
                title: s.title.trim(),
                lat: s.position.lat,
                lng: s.position.lon,
                value: valueByKey.get(key),
            }));
    }

    async setCircles() {
        const id = this.nextRequest();
        const values = await this.stationValues();
        if (!values || !this.isCurrent(id)) return;
        this.clearMarkers();
        //Here we set the radius according to the selected count
        this.drawCircles(values.map(d => ({...d, radius: d.value / 50, label: `${d.title}: ${d3.format(',')(d.value)}`})));
    }

    async setHeatmap() {
        const id = this.nextRequest();
        const values = await this.stationValues();
        if (!values || !this.isCurrent(id)) return;
        this.clearMarkers();
        this.drawHeatmap(values.map(d => ({...d, weight: d.value})));
    }
}
