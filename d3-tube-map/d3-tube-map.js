(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('d3')) :
        typeof define === 'function' && define.amd ? define(['exports', 'd3'], factory) :
            (factory((global.tubeMap = {}), global.d3));
}(this, (function (exports, d3) {
    'use strict';

    function tubeMap() {
        var margin = {top: 80, right: 80, bottom: 20, left: 80};
        var width = 800;
        var height = 800;
        var xScale = d3.scaleLinear();
        var yScale = d3.scaleLinear();
        var xGeoScale = d3.scaleLinear();
        var yGeoScale = d3.scaleLinear();
        var lineWidth;
        var lineWidthMultiplier = 1.0;

        var dispatch$$1 = d3.dispatch("click");

        var svg;

        var model;

        var gEnter;
        var zoom$$1;

        var timer;

        var timeStop = false;

        var t;
        var s;
        let dataStore = null;
        let currentStationSelection = null;
        let lineModeActive = false;
        const parseTime = d3.timeParse("%Y");
        const lineChartWidth = 600;
        const lineChartHeight = 400;
        const lineChartMargin = {top: 20, right: 20, bottom: 30, left: 40};
        const entryChartSVG = d3.select('.entry').append('svg')
            .attr('width', lineChartWidth + lineChartMargin.left + lineChartMargin.right)
            .attr('height', lineChartHeight + lineChartMargin.top + lineChartMargin.bottom)

        const exitChartSVG = d3.select('.exit').append('svg')
            .attr('width', lineChartWidth + lineChartMargin.left + lineChartMargin.right)
            .attr('height', lineChartHeight + lineChartMargin.top + lineChartMargin.bottom)

        const calcExtents = data => {
            // d3.max ignores NaN, so missing values don't poison the domain
            const max = d3.max(data, d=>d3.max([d.saturday, d.sunday, d.week]));
            return [0, max || 0];

        }

        const formatEntryData = data=> {
            return data.map(d=>({
                saturday: d.entry_saturday,
                sunday: d.entry_sunday,
                week: d.entry_week,
                station: d.station,
                year: parseTime(d.year)
            }));
        }
        const formatExitData = data => {

            return data.map(d=>({
                saturday: d.exit_saturday,
                sunday: d.exit_sunday,
                week: d.exit_week,
                station: d.station,
                year: parseTime(d.year)
            }));

        }

        const aggregateData = ({yearData}) => {
            const entryData = formatEntryData(yearData);
            const exitData = formatExitData(yearData);
            return prepareDataForLine(entryData, exitData);
        }


        const filterDataByCity = city => {
            // One row per year (a station can match more than one CSV spelling)
            const filtered = Array.from(d3.group(
                dataStore.yearData.filter(d=>d.keys.includes(city)), d=>d.year
            ).values(), rows=>rows[0]);
            const entryData = formatEntryData(filtered);
            const exitData = formatExitData(filtered);
            return prepareDataForLine(entryData, exitData)
        };

        const prepareDataForLine = (entryData, exitData) => {
            const entryExtents = calcExtents(entryData);
            const entrySaturday = entryData.map(d=>({
                day: 'saturday',
                value: d.saturday,
                year: d.year,
                type: 'entry',
                color: 'green',
                extents: entryExtents
            })).filter(d=>!isNaN(d.value));
            const entrySunday = entryData.map(d=>({
                day: 'sunday',
                value: d.sunday,
                year: d.year,
                type: 'entry',
                color: 'blue',
                extents: entryExtents
            })).filter(d=>!isNaN(d.value));
            const entryWeek = entryData.map(d=>({
                day: 'week',
                value: d.week,
                year: d.year,
                type: 'entry',
                color: 'orange',
                extents: entryExtents
            })).filter(d=>!isNaN(d.value));

            const exitExtents = calcExtents(exitData);
            const exitSaturday = exitData.map(d=>({
                day: 'saturday',
                value: d.saturday,
                year: d.year,
                type: 'exit',
                color: 'green',
                extents: exitExtents
            })).filter(d=>!isNaN(d.value));
            const exitSunday = exitData.map(d=>({
                day: 'sunday',
                value: d.sunday,
                year: d.year,
                type: 'exit',
                color: 'blue',
                extents: exitExtents
            })).filter(d=>!isNaN(d.value));
            const exitWeek = exitData.map(d=>({
                day: 'week',
                value: d.week,
                year: d.year,
                type: 'exit',
                color: 'orange',
                extents: exitExtents
            })).filter(d=>!isNaN(d.value));

            return [entrySaturday, entrySunday, entryWeek, exitSaturday, exitSunday, exitWeek];

        }

        // ---- Station survey charts (2016 RODS) ---------------------------------
        // One horizontal bar chart per survey question. Values are each answer's
        // share of the station's respondents, so two stations of very different
        // size can be compared directly; raw counts are in the tooltip.
        const SERIES_COLORS = ['#2a78d6', '#eb6834']; // selected station, comparison station
        const SURVEY_CHARTS = [
            {label: 'Age', selector: '.ageChart'},
            {label: 'Sex', selector: '.sexChart'},
            {label: 'Journey', selector: '.journeyChart'},
            {label: 'Market', selector: '.marketChart'},
        ];
        const SURVEY_LAYOUT = {labelWidth: 76, valueWidth: 40, barHeight: 12, barGap: 2, rowPad: 10, axisHeight: 18};
        const formatCount = d3.format(',.0f');
        const formatShare = share => (share > 0 && share < 0.01) ? '<1%' : d3.format('.0%')(share);
        let lastSurveyStations = null;

        const formatBarData = (data)=> {
            if (!data) return;
            const {age, journey, market} = data;
            if (age.length === 0 || journey.length === 0 || market.length === 0) {
                alert('No 2016 survey data is available for this station.');
                return null;
            }
            // Sum the matching rows (the exit and entry survey files)
            const sum = (rows, key) => d3.sum(rows, d=>d[key]);

            const ageData = [];
            ageMap.forEach((category, key)=> ageData.push({category, value: sum(age, key)}));

            const sexData = [{category: 'Male', value: sum(age, 'male')},
                {category: 'Female', value: sum(age, 'female')}];

            const journeyData = [];
            journeyMap.forEach((category, key)=> journeyData.push({category, value: sum(journey, key)}));

            const marketData = [];
            marketMap.forEach((category, key)=> marketData.push({category, value: sum(market, key)}));

            return [
                {label: 'Age', data: ageData},
                {label: 'Sex', data: sexData},
                {label: 'Journey', data: journeyData},
                {label: 'Market', data: marketData}];
        }
        const filetBarDataByStation = station => {
            const {ageData, marketData, journeyData} = dataStore;
            const age = ageData.filter(d=>d.keys.includes(station));
            const journey = journeyData.filter(d=>d.keys.includes(station));
            const market = marketData.filter(d=>d.keys.includes(station));
            return formatBarData({age, journey, market});

        }

        // Horizontal bar with a 4px rounded data end and a square baseline end
        const barPath = (x, y, w, h) => {
            const r = Math.max(0, Math.min(4, w, h / 2));
            return `M${x},${y}h${w - r}a${r},${r} 0 0 1 ${r},${r}v${h - 2 * r}` +
                `a${r},${r} 0 0 1 ${-r},${r}h${-(w - r)}Z`;
        };

        const surveyTooltip = () => {
            let tip = d3.select('body').select('.chart-tooltip');
            if (tip.empty()) {
                tip = d3.select('body').append('div').attr('class', 'chart-tooltip').attr('aria-hidden', 'true');
            }
            return tip;
        };

        const moveSurveyTooltip = event => {
            const tip = surveyTooltip();
            const node = tip.node();
            const pad = 14;
            let left = event.clientX + pad;
            let top = event.clientY + pad;
            if (left + node.offsetWidth > window.innerWidth - 8) left = event.clientX - node.offsetWidth - pad;
            if (top + node.offsetHeight > window.innerHeight - 8) top = event.clientY - node.offsetHeight - pad;
            tip.style('left', `${left}px`).style('top', `${top}px`);
        };

        const showSurveyTooltip = (event, category, series, shares) => {
            const tip = surveyTooltip();
            tip.selectAll('*').remove();
            tip.append('div').attr('class', 'tt-title').text(category);
            series.forEach((s, i) => {
                const {share, count} = shares[i].get(category);
                const row = tip.append('div').attr('class', 'tt-row');
                row.append('span').attr('class', 'tt-swatch').style('background', s.color);
                row.append('span').attr('class', 'tt-name').text(s.name);
                row.append('span').attr('class', 'tt-value').text(formatShare(share));
                row.append('span').attr('class', 'tt-count').text(`${formatCount(count)} people`);
            });
            tip.classed('visible', true);
            moveSurveyTooltip(event);
        };

        const hideSurveyTooltip = () => d3.select('.chart-tooltip').classed('visible', false);

        const renderSurveyChart = (selector, title, series) => {
            const root = d3.select(selector);
            root.selectAll('*').remove();
            const L = SURVEY_LAYOUT;
            const categories = series[0].rows.map(d => d.category);
            const shares = series.map(s => {
                const total = d3.sum(s.rows, d => d.value);
                return new Map(s.rows.map(d => [d.category, {count: d.value, share: total ? d.value / total : 0}]));
            });

            const width = Math.max(220, root.node().clientWidth || 260);
            const rowHeight = series.length * L.barHeight + (series.length - 1) * L.barGap + L.rowPad;
            const plotBottom = categories.length * rowHeight;
            const height = plotBottom + L.axisHeight;
            const plotWidth = width - L.labelWidth - L.valueWidth;
            const maxShare = d3.max(shares, m => d3.max(Array.from(m.values()), d => d.share)) || 1;
            const x = d3.scaleLinear().domain([0, maxShare]).nice(4).range([0, plotWidth]);
            const y = d3.scaleBand().domain(categories).range([0, plotBottom]);
            const ticks = x.ticks(plotWidth < 170 ? 3 : 4);

            const summary = series.map((s, i) => `${s.name}: ` + categories
                .map(c => `${c} ${formatShare(shares[i].get(c).share)}`).join(', ')).join('. ');
            const chart = root.append('svg')
                .attr('class', 'surveyChart')
                .attr('width', width)
                .attr('height', height)
                .attr('role', 'img')
                .attr('aria-label', `${title}. ${summary}`);
            const plot = chart.append('g').attr('transform', `translate(${L.labelWidth},0)`);

            plot.append('g').attr('class', 'grid').selectAll('line').data(ticks.filter(t => t > 0)).join('line')
                .attr('x1', x).attr('x2', x)
                .attr('y1', 0).attr('y2', plotBottom);
            plot.append('g').attr('class', 'tick-labels').selectAll('text').data(ticks).join('text')
                .attr('x', x)
                .attr('y', height - 4)
                .attr('text-anchor', (d, i) => i === 0 ? 'start' : 'middle')
                .text(formatShare);

            const rows = plot.selectAll('g.surveyRow').data(categories).join('g')
                .attr('class', 'surveyRow')
                .attr('transform', d => `translate(0,${y(d)})`);

            // The hover target spans the whole row, label included
            rows.append('rect')
                .attr('class', 'rowHover')
                .attr('x', -L.labelWidth)
                .attr('width', width)
                .attr('height', rowHeight);

            rows.append('text')
                .attr('class', 'category-label')
                .attr('x', -8)
                .attr('y', rowHeight / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'end')
                .text(d => d);

            series.forEach((s, i) => {
                const barY = L.rowPad / 2 + i * (L.barHeight + L.barGap);
                rows.append('path')
                    .attr('class', 'bar')
                    .attr('fill', s.color)
                    .attr('d', barPath(0, barY, 0, L.barHeight))
                    .transition()
                    .duration(450)
                    .delay((d, j) => j * 25)
                    .ease(d3.easeCubicOut)
                    .attrTween('d', category => {
                        const w = x(shares[i].get(category).share);
                        return t => barPath(0, barY, w * t, L.barHeight);
                    });
            });

            // A single station gets its value at the bar tip; a comparison
            // leaves the numbers to the axis and tooltip to keep it readable
            if (series.length === 1) {
                rows.append('text')
                    .attr('class', 'value-label')
                    .attr('x', d => x(shares[0].get(d).share) + 6)
                    .attr('y', rowHeight / 2)
                    .attr('dy', '0.35em')
                    .text(d => formatShare(shares[0].get(d).share));
            }

            plot.append('line')
                .attr('class', 'baseline')
                .attr('x1', 0).attr('x2', 0)
                .attr('y1', 0).attr('y2', plotBottom);

            rows.on('mouseenter', (event, category) => showSurveyTooltip(event, category, series, shares))
                .on('mousemove', moveSurveyTooltip)
                .on('mouseleave', hideSurveyTooltip);
        };

        const renderSurveyHeader = series => {
            const header = d3.select('.surveyHeader');
            header.selectAll('*').remove();
            header.append('h2').text(series.map(s => s.name).join(' vs '));
            if (series.length > 1) {
                const legend = header.append('div').attr('class', 'surveyLegend');
                series.forEach(s => {
                    const item = legend.append('span').attr('class', 'surveyLegendItem');
                    item.append('span').attr('class', 'swatch').style('background', s.color);
                    item.append('span').text(s.name);
                });
            }
            header.append('p').attr('class', 'surveyNote')
                .text('Share of each station’s respondents in the 2016 Rolling Origin & Destination Survey. ' +
                    'Hover a row for the number of people.');
        };

        // Draws the four survey charts for one station, or two to compare.
        // Returns false when a station has no survey data.
        // The charts sit above the line, so a station picked further down the
        // page would fill them in out of sight: bring their top into view
        const revealSurvey = () => {
            const node = d3.select('.barChartWrapper').node();
            if (!node) return;
            const top = node.getBoundingClientRect().top;
            if (top < 0 || top > window.innerHeight * 0.6) {
                node.scrollIntoView({behavior: 'smooth', block: 'start'});
            }
        };

        const renderSurvey = (stationKeys, reveal = false) => {
            const datasets = stationKeys.map(filetBarDataByStation);
            if (datasets.some(d => !d)) return false;
            const series = datasets.map((data, i) => ({
                name: stationTitle(stationKeys[i]),
                color: SERIES_COLORS[i],
                data,
            }));
            lastSurveyStations = stationKeys;
            hideSurveyTooltip();
            d3.select('.barChartWrapper').classed('showMe', true);
            renderSurveyHeader(series);
            SURVEY_CHARTS.forEach(({label, selector}) => {
                const title = d3.select(selector).attr('data-title') || label;
                renderSurveyChart(selector, title, series.map(s => ({
                    name: s.name,
                    color: s.color,
                    rows: s.data.find(d => d.label === label).data,
                })));
            });
            if (reveal) revealSurvey();
            return true;
        };

        let surveyResizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(surveyResizeTimer);
            surveyResizeTimer = setTimeout(() => {
                if (lastSurveyStations && d3.select('.barChartWrapper').classed('showMe')) {
                    renderSurvey(lastSurveyStations);
                }
            }, 150);
        });

        const hideSurvey = () => {
            lastSurveyStations = null;
            currentStationSelection = null;
            hideSurveyTooltip();
            d3.select('.barChartWrapper').classed('showMe', false);
        };

        const barChartFactory = station => {
            currentStationSelection = station;
            d3.selectAll('.station-circle').classed('compareSelected', false);
            d3.select('.selectLeft').property('selectedIndex', 0);
            if (!renderSurvey([station], true)) d3.select('.barChartWrapper').classed('showMe', false);
        }

        // Lay a line's stations out as a "snake": rows that fill the visible
        // width, alternating direction, joined by rounded U-turns. Coordinates
        // are in map space (the map group is shifted up 100px in line mode).
        const SNAKE = {spacing: 90, rowGap: 130, left: 90, top: 200};
        const snakeLayout = count => {
            const host = document.getElementById('tube-map');
            let available = (host && host.clientWidth) || 1600;
            // Stop short of the legend panel pinned to the right of the page
            const legend = document.querySelector('.legendWrapper');
            if (host && legend && legend.offsetParent) {
                const room = legend.getBoundingClientRect().left - host.getBoundingClientRect().left - 20;
                if (room > 0) available = Math.min(available, room);
            }
            const turn = SNAKE.rowGap / 2;
            // Leave room on the right for the U-turn's bulge
            const usable = available - SNAKE.left - turn - 20;
            const perRow = Math.max(2, Math.min(count, Math.floor(usable / SNAKE.spacing) + 1));
            const points = d3.range(count).map(j => {
                const row = Math.floor(j / perRow);
                const col = j % perRow;
                const column = row % 2 === 0 ? col : perRow - 1 - col;
                return [SNAKE.left + column * SNAKE.spacing, SNAKE.top + row * SNAKE.rowGap];
            });
            let path = `M${points[0][0]},${points[0][1]}`;
            for (let j = 1; j < count; j++) {
                const [x, y] = points[j];
                if (y !== points[j - 1][1]) {
                    // Rounded U-turn, bulging out past the right edge on even
                    // rows and the left edge on odd rows. A cubic curve rather
                    // than an SVG arc: the line animates by interpolating the
                    // numbers in its path, which would corrupt an arc's 0/1 flags.
                    const bulge = (Math.floor((j - 1) / perRow) % 2 === 0 ? 1 : -1) * turn * 4 / 3;
                    const [px, py] = points[j - 1];
                    path += `C${px + bulge},${py} ${x + bulge},${y} ${x},${y}`;
                } else {
                    path += `L${x},${y}`;
                }
            }
            const rows = Math.ceil(count / perRow);
            return {points, path, height: SNAKE.top + (rows - 1) * SNAKE.rowGap};
        };

        // A station on the straightened line was picked, by its dot or its name
        const selectLineStation = name => {
            d3.select('#line').selectAll('.station-circle')
                .classed('notSelected', true)
                .classed('stationSelected', d => d.name === name);
            d3.select('#line').selectAll('.line-station-label')
                .classed('selectedName', d => d.name === name);
            barChartFactory(name);
        }

        const stationTitle = key => {
            const station = dataStore && dataStore.stations.stations[key];
            return station && station.title ? station.title : key;
        };

        const dropDownFactory = ({nodes})=> {
            const stations = nodes.map(d=>d.name).filter(d=>d !== undefined);
            d3.select('.showBarDiff').style('display', 'block');
            d3.select('.barChartDropDown').classed('showMe', true);
            makeDropDown(stations);
            d3.select('.lineMode').classed('showMe', true)
        }


        const barDiffFactory = () => {
            const compareStation = d3.select('.selectLeft').property('value');
            if (!currentStationSelection) {
                alert('Select a station on the line first, then choose a station to compare it with.');
                d3.select('.selectLeft').property('selectedIndex', 0);
                return;
            }
            if (!compareStation) return;
            d3.selectAll('.station-circle').classed('compareSelected', d => d.name === compareStation);
            renderSurvey([currentStationSelection, compareStation], true);
        }


        const makeLine = (data, station) => {
            if (data.length < 1) return;
            d3.select('.linechart').classed('showMe', true);
            const {type, extents, color, day} = data[0];
            const x = d3.scaleTime().range([0, lineChartWidth]);
            const y = d3.scaleLinear().range([lineChartHeight, 0]);
            const mySVG = (type === 'entry') ? entryChartSVG : exitChartSVG;
            const xAxis = d3.axisBottom(x);
            const yAxis = d3.axisLeft(y)
                .ticks(6, 's')

            const valueline = d3.line()
                .x(d=>x(d.year))
        .y(d=>y(d.value));

            x.domain(d3.extent(data, d=> d.year));
            y.domain(extents);

            const line = mySVG.append("g")
                .classed('lineGroup', true)
                .classed(`line-${day}`, true)
                .classed('visible', true)
                .attr("transform", "translate(" + lineChartMargin.left + "," + lineChartMargin.top + ")");

            line.append("g")
                .attr("class", "axis axis--x")
                .attr("transform", "translate(0," + lineChartHeight + ")")
                .call(xAxis);

            line.append("g")
                .attr("class", "axis axis--y")
                .attr("transform", 'translate(0,0 )')
                .call(yAxis)
                .append("text")
                .attr("class", "axis-title")
                .attr("transform", "rotate(-90)")
                .attr("y", 6)
                .attr("dy", ".71em")
                .style("text-anchor", "end")
                .attr("fill", "#5D6971")
                .text("Unit");

            line.append("path")
                .datum(data)
                .attr("class", "line")
                .attr("d", valueline)
                .attr('stroke', color)

            d3.select(`.${day}`).style('background', color)
            d3.select('.linechart .station').text(station ? stationTitle(station) : 'Summary Data');
            d3.select('body').classed('modal', true);
            d3.select('.zoomRect').classed('modal', true);
            d3.select('.close').on('click', ()=> {
                d3.select('body').classed('modal', false);
            d3.select('.zoomRect').classed('modal', false);
            d3.select('.linechart').classed('showMe', false);
        })

            d3.select(`.${day}`).on('click', ()=> {
                const isVisible = d3.select(`.line-${day}`).attr('class').indexOf('notVisible') > 0;
            d3.selectAll(`.line-${day}`).classed('notVisible', !isVisible);
            d3.select(`.${day}`).classed('notVisibleLegend', !isVisible);

        })

        }


        const lineFactory = station => {
            const lineData = filterDataByCity(station)
            d3.selectAll('.lineGroup').remove();
            lineData.forEach(line=>makeLine(line, station))

        }

        const addSummaryListener = ()=> {
            // const aggData = aggregateData(dataStore);
            d3.select('.lineMode').on('click', ()=> {
                d3.selectAll('.lineGroup').remove();
                if (!currentStationSelection) {
                    alert('Select a station on the line first to see its yearly entry/exit counts.');
                    return;
                }
                lineFactory(currentStationSelection);
            })
        }


        const makeDropDown = categories => {
            d3.selectAll('.selectLeft').remove();
            const dropleft = d3.select('.dropleft')
                .append('select')
                .attr('class', 'selectLeft')
                .on('change', ()=> barDiffFactory())

            dropleft.append('option')
                .attr('value', '')
                .property('disabled', true)
                .property('selected', true)
                .text('-- compare with --');

            dropleft.selectAll('option.stationOption')
                .data(categories)
                .join('option')
                .classed('stationOption', true)
                .attr('value', d=>d)
                .text(d=>stationTitle(d));
        }


        function map(selection) {
            selection.each(function (data) {
                // Convert data to standard representation
                dataStore = data;
                console.log(dataStore, 'store')
                data = mangleData(data.stations);
                addSummaryListener();
                model = data;

                var minX = d3.min(data.raw, function (line$$1) {
                    return d3.min(line$$1.nodes, function (node) {
                        return node.coords[0];
                    });
                });
                var maxX = d3.max(data.raw, function (line$$1) {
                    return d3.max(line$$1.nodes, function (node) {
                        return node.coords[0];
                    });
                });

                var minY = d3.min(data.raw, function (line$$1) {
                    return d3.min(line$$1.nodes, function (node) {
                        return node.coords[1];
                    });
                });
                var maxY = d3.max(data.raw, function (line$$1) {
                    return d3.max(line$$1.nodes, function (node) {
                        return node.coords[1];
                    });
                });

                var desiredAspectRatio = (maxX - minX) / (maxY - minY);
                var actualAspectRatio = (width - margin.left - margin.right) / (height - margin.top - margin.bottom);
                var ratioRatio = actualAspectRatio / desiredAspectRatio;

                var maxXRange, maxYRange;

                // Note that we flip the sense of the y-axis here
                if (desiredAspectRatio > actualAspectRatio) {
                    maxXRange = width - margin.left - margin.right;
                    maxYRange = (height - margin.top - margin.bottom) * ratioRatio;
                } else {
                    maxXRange = (width - margin.left - margin.right) / ratioRatio;
                    maxYRange = height - margin.top - margin.bottom;
                }

                // Update the x-scale
                xScale.domain([minX, maxX]).range([0, maxXRange]);

                // Update the y-scale
                yScale.domain([minY, maxY]).range([maxYRange, 0]);

                // Update the x-geo-scale
                xGeoScale.domain([d3.min(data.stations.toArray(), function (station) {
                    if (station.position !== undefined) {
                        return station.position.lon;
                    }
                }), d3.max(data.stations.toArray(), function (station) {
                    if (station.position !== undefined) {
                        return station.position.lon;
                    }
                })]).range([0, maxXRange]);

                // Update the y--geo-scale
                yGeoScale.domain([d3.min(data.stations.toArray(), function (station) {
                    if (station.position !== undefined) {
                        return station.position.lat;
                    }
                }), d3.max(data.stations.toArray(), function (station) {
                    if (station.position !== undefined) {
                        return station.position.lat;
                    }
                })]).range([maxYRange, 0]);

                // Update line width
                lineWidth = lineWidthMultiplier * (xScale(1) - xScale(0));

                // Select the svg element, if it exists
                svg = d3.select(this).selectAll("svg").data([data]);


                var g = svg.enter().append("g").classed('stationWrapper', true);

                // Fill with white rectangle to capture zoom events
                g.append("rect")
                    .attr("width", "100%")
                    .attr("height", "100%")
                    .attr('fill', 'white')
                    .classed('zoomRect', true);

                var zoomed = function zoomed(event) {
                    gEnter.attr("transform", event.transform.toString());
                };

                // While a line is straightened, the mouse wheel scrolls the page
                // (to reach the station charts) instead of zooming the map
                zoom$$1 = d3.zoom().scaleExtent([0.5, 6])
                    .filter(function (event) {
                        return !lineModeActive && (!event.ctrlKey || event.type === 'wheel') && !event.button;
                    })
                    .on("zoom", zoomed);

                gEnter = g.call(zoom$$1).append("g");

                var river = gEnter.append("g").attr("class", "river").selectAll("path").data(function (d) {
                    return [d.river];
                });

                var lines = gEnter.append("g").attr("class", "line").attr("id", "line").selectAll("path").data(function (d) {
                    return d.lines.lines;
                });

                var interchanges = gEnter.append("g").attr("class", "interchanges").selectAll("path").data(function (d) {
                    return d.stations.interchanges();
                });

                var stations = gEnter.append("g").attr("class", "station").selectAll("path").data(function (d) {
                    return d.stations.normalStations();
                });


                var labels = gEnter.append("g").attr("class", "labels").selectAll("text").data(function (d) {
                    return d.stations.toArray();
                });

                var geoStations = gEnter.append("g").attr("class", "geoStations").style("display", "none").selectAll("path").data(function (d) {
                    return d.stations.toArray();
                });

                var discrepencies = gEnter.append("g").attr("class", "discrepencies").style("display", "none").selectAll("path").data(function (d) {
                    return d.stations.toArray();
                });

                // Update the outer dimensions
                svg.attr("width", '100%').attr("height", '100%');


                // Update the river
                river.enter().append("path").attr("d", drawLine).attr("stroke", "#C4E8F8").attr("fill", "none").attr("a", 1.8 * lineWidth);

                var self_item = this;
                var pathStorage = [];

                var markerFunction = d3.arc().innerRadius(0).outerRadius(lineWidth).startAngle(0).endAngle(2 * Math.PI);

                // Update the lines
                lines.enter().append("path")
                    .attr("d", drawLine)
                    .attr("id", function (d) {
                        return d.title;
                    })
                    .attr("stroke", function (d) {
                        return d.color;
                    })
                    .attr("fill", "none").attr("stroke-width", function (d) {
                    return d.highlighted ? lineWidth * 1.5 : 1.5*lineWidth;
                })
                    .attr("class", function (d) {
                        return d.name;
                    })
                    .classed("line", true).on("click", function (event, line) {
                    dropDownFactory(line);

                    //Here we transform the path
                    //var stations = d3.select("#map").selectAll(".station");
                    //console.log(stations);
                    //stations.filter("." + name);
                    //Construct new path string
                    var newPath = "M";
                    var name = d3.select(this).attr("id");
                    var lines = d3.select("#tube-map").selectAll(".line");
                    //List that contains all names of the stations on selected line
                    var stationOrder = [];
                    //List that contains all the points together with the names
                    var stationPoints = [];
                    var lineName;
                    lines.style("opacity", function (d) {
                        if (d.title === name) {
                            stationOrder = d.stations;
                            lineName = d.name;
                        }
                    });
                    //These are all the stations that are on the selected line
                    var thisLineStations = d3.selectAll(".station").selectAll("." + lineName);
                    //here we have the list of paths that correspond to the stations
                    var idIndicator = false;
                    var index = -1;

                    for (var k = 0; k < pathStorage.length; k++) {
                        if (pathStorage[k].id != null) {
                            if (pathStorage[k].id == name) {
                                idIndicator = true;
                                index = k;
                            }
                        }
                    }
                    //The line is not currently transformed
                    if (idIndicator == false) {
                        var path = d3.select(this).attr('d');
                        map.highlightLine(name);
                        //Store the old path to transition back to
                        pathStorage.push({"id": name, "path": path});
                        //Construct the object that ties names to stations and coordinates,
                        //snaking the stations across the page in rows
                        var snake = snakeLayout(stationOrder.length);
                        newPath = snake.path;
                        stationOrder.forEach(function (station, j) {
                            stationPoints.push({name: station, coords: snake.points[j]});
                        });
                        d3.select('#container').attr('height', snake.height);
                    }
                    else {
                        map.unhighlightAll();
                        newPath = pathStorage[index].path;
                        pathStorage.splice(index, 1);
                    }

                    //Here we append circles that represent each station on the line
                    var svgCir = d3.select("#line").selectAll("g").data(stationPoints);
                    svgCir.exit().remove();
                    svgCir = svgCir.enter().append("g").merge(svgCir);
                    svgCir.append("circle")
                        .attr("class", "station-circle").classed('stationSelect', true)
                        .attr("cx", function (d, i) {
                            return d.coords[0]
                        })
                        .attr("cy", function (d) {
                            return d.coords[1]
                        })
                        .attr("r", 6).style("visibility", "visible")
                        .on("click", function (event, d) {
                            selectLineStation(d.name);
                        })


                        .attr("stroke", fgColor)
                        .attr("fill", bgColor)
                        .attr("stroke-width", lineWidth / 2);

//Set the staion names, first append g
var station_text = d3.select("#line").selectAll("g").data(stationPoints);

station_text.exit().remove();

station_text = station_text.enter().append("g").attr("display", "inline").merge(station_text);


                    // One label per station group (binding the whole list here
                    // drew every name once per station, stacked on top of itself)
                    var text = station_text.selectAll('text')
                        .data(function (d) { return [d]; });
                    text.exit().remove();
                    text = text.enter()
                        .append('text').merge(text);
                    //Set station names
                    text.attr('x', function (d) {
                        return d.coords[0];
                    })
                        .attr('y', function (d) {
                            // Alternate names above/below the line
                            if (stationPoints.indexOf(d) % 2 === 0) {
                                return d.coords[1] + 20;
                            }
                            else return d.coords[1] - 20;
                        })
                        .attr("position", "absolute")
                        .text(function (d) {
                            return stationTitle(d.name);
                        })
                        .attr("dy", ".3em")
                        .style("visibility", "visible")// change dx and dy in order to center in the circle.
                        .style("text-anchor", "middle")
                        .classed("line-station-label", true)
                        .on("click", function (event, d) {
                            selectLineStation(d.name);
                        });
                    d3.select(this).interrupt().transition().duration(800).ease(d3.easeCubicInOut).attr("d", newPath);
                }).on("mouseover", function () {
                  var name = d3.select(this).attr("id");
                  //map.highlightLine(name);
                  d3.select(this).style('stroke-width', 10);


                }).on("mouseout", function () {
                  d3.select(this).style('stroke-width', lineWidth);
                    //map.unhighlightAll();
                });


                // Clicking a station name on the full map opens its line, as if
                // the line had been clicked. A station on several lines or
                // branches opens the longest one.
                var openLineForStation = function (name) {
                    if (pathStorage.length) return;
                    var best = null;
                    d3.select("#tube-map").selectAll("path.line").each(function (d) {
                        var onLine = d.nodes.some(function (n) { return n.name === name; });
                        if (onLine && (!best || d.stations.length > best.datum.stations.length)) {
                            best = {el: this, datum: d};
                        }
                    });
                    if (best) d3.select(best.el).dispatch("click");
                };

                // Re-flow the snaked line when the window is resized
                var snakeResizeTimer = null;
                window.addEventListener('resize', function () {
                    clearTimeout(snakeResizeTimer);
                    snakeResizeTimer = setTimeout(function () {
                        if (!pathStorage.length) return;
                        var lineGroup = d3.select('#line');
                        var points = lineGroup.selectAll('.station-circle').data();
                        if (!points.length) return;
                        var snake = snakeLayout(points.length);
                        points.forEach(function (d, j) { d.coords = snake.points[j]; });
                        lineGroup.selectAll('.station-circle')
                            .attr('cx', function (d) { return d.coords[0]; })
                            .attr('cy', function (d) { return d.coords[1]; });
                        lineGroup.selectAll('.line-station-label')
                            .attr('x', function (d) { return d.coords[0]; })
                            .attr('y', function (d) {
                                return d.coords[1] + (points.indexOf(d) % 2 === 0 ? 20 : -20);
                            });
                        d3.select('#tube-map').select('path.line[id="' + CSS.escape(pathStorage[0].id) + '"]')
                            .interrupt()
                            .attr('d', snake.path);
                        d3.select('#container').attr('height', snake.height);
                    }, 150);
                });

                // Restore the full map: "click" whichever line is currently straightened
                map.returnToFullMap = function () {
                    d3.select("#tube-map").selectAll(".line")
                        .filter(function (d) {
                            return pathStorage.some(function (p) { return p.id === d.title; });
                        })
                        .dispatch("click");
                };

                var fgColor = "#000000";
                var bgColor = "#ffffff";


                // Update the interchanges
                interchanges.enter().append("g")
                    .attr("id", function (d) {
                        return d.name;
                    })
                    .on("click", function () {
                        var label = d3.select(this);
                        var name = label.attr("id");
                        selectStation(name);
                        dispatch$$1.call("click", this, name);
                    })
                    .append("path").attr("d", markerFunction).attr("transform", function (d) {
                    return "translate(" + xScale(d.x + d.marker[0].shiftX * lineWidthMultiplier) + "," + yScale(d.y + d.marker[0].shiftY * lineWidthMultiplier) + ")";
                })
                    .attr("stroke-width", lineWidth / 2).attr("fill", function (d) {
                    return d.visited ? fgColor : bgColor;
                })
                    .attr("stroke", function (d) {
                        return d.visited ? bgColor : fgColor;
                    })
                    .classed("interchange", true).style("cursor", "pointer");

                var lineFunction = d3.line().x(function (d) {
                    return xScale(d[0]);
                }).y(function (d) {
                    return yScale(d[1]);
                });

                // Update the stations
                stations.enter().append("g").attr("id", function (d) {
                    return d.name;
                })
                    .on("click", function () {
                        var label = d3.select(this);
                        var name = label.attr("id");
                        selectStation(name);
                        dispatch$$1.call("click", this, name);
                    })
                    .append("path").attr("d", function (d) {
                    var dir;
                    var sqrt2 = Math.sqrt(2);

                    switch (d.labelPos.toLowerCase()) {
                        case "n":
                            dir = [0, 1];
                            break;
                        case "ne":
                            dir = [1 / sqrt2, 1 / sqrt2];
                            break;
                        case "e":
                            dir = [1, 0];
                            break;
                        case "se":
                            dir = [1 / sqrt2, -1 / sqrt2];
                            break;
                        case "s":
                            dir = [0, -1];
                            break;
                        case "sw":
                            dir = [-1 / sqrt2, -1 / sqrt2];
                            break;
                        case "w":
                            dir = [-1, 0];
                            break;
                        case "nw":
                            dir = [-1 / sqrt2, 1 / sqrt2];
                            break;
                        default:
                            break;
                    }
                    return lineFunction([[d.x + d.shiftX * lineWidthMultiplier + lineWidthMultiplier / 2.05 * dir[0], d.y + d.shiftY * lineWidthMultiplier + lineWidthMultiplier / 2.05 * dir[1]], [d.x + d.shiftX * lineWidthMultiplier + lineWidthMultiplier * dir[0], d.y + d.shiftY * lineWidthMultiplier + lineWidthMultiplier * dir[1]]]);
                })
                    .attr("stroke", function (d) {
                        return d.color;
                    })
                    .attr("stroke-width", lineWidth / 2).attr("fill", "none").attr("class", function (d) {
                    return d.line;
                })
                    .attr("id", function (d) {
                        return d.name;
                    })
                    .classed("station", true);

      // Update the label text
      labels.enter().append("g").attr("id", function (d) {
        return d.name;
      }).classed("label", true).on("click", function () {
        var name = d3.select(this).attr("id");
        dispatch$$1.call("click", this, name);
        openLineForStation(name);
      }).append("text").text(function (d) {
        return d.text;
      }).attr("dy", 0.1).attr("x", function (d) {
        return xScale(d.x + d.labelShiftX) + textPos(d).pos[0];
      }).attr("y", function (d) {
        return yScale(d.y + d.labelShiftY) - textPos(d).pos[1];
      }) // Flip y-axis
      .attr("text-anchor", function (d) {
        return textPos(d).textAnchor;
      }).style("display", function (d) {
        return d.hide !== true ? "block" : "none";
      }).style("font-size", 1.2 * lineWidth / lineWidthMultiplier + "px").style("user-select", "none").attr("class", function (d) {
        return d.marker.map(function (marker) {
          return marker.line;
        }).join(" ");
      }).classed("highlighted", function (d) {
        return d.visited;
      }).call(wrap);

                var markerGeoFunction = d3.arc().innerRadius(0).outerRadius(lineWidth / 4).startAngle(0).endAngle(2 * Math.PI);

                // Update the geo stations
                geoStations.enter().append("path")
                    .attr("d", markerGeoFunction)
                    .attr("transform", function (d) {
                        return "translate(" + xGeoScale(d.position !== undefined ? d.position.lon : NaN) + "," + yGeoScale(d.position !== undefined ? d.position.lat : NaN) + ")";
                    })
                    .attr("id", function (d) {
                        return d.name;
                    })
                    .attr("fill", '#888888');

                // Update the geo stations
                discrepencies.enter().append("path")
                    .attr("d", function (d) {
                        return d3.line()([[xScale(d.x), yScale(d.y)], [xGeoScale(d.position.lon), yGeoScale(d.position.lat)]]);
                    })
                    .attr("id", function (d) {
                        return d.name;
                    })
                    .attr("stroke", '#AAAAAA').attr("stroke-width", lineWidth / 4).style("stroke-dasharray", "3, 3");
            });


        }

        map.width = function (w) {
            if (!arguments.length) return width;
            width = w;
            return map;
        };

        map.height = function (h) {
            if (!arguments.length) return height;
            height = h;
            return map;
        };

        map.margin = function (m) {
            if (!arguments.length) return margin;
            margin = m;
            return map;
        };

        map.highlightLine = function (name) {
            var lines = d3.select("#tube-map").selectAll(".line");
            var stations = d3.select("#tube-map").selectAll(".station");
            var labels = d3.select("#tube-map").selectAll(".labels");
            var interchanges = d3.select("#tube-map").selectAll(".interchanges");
            var river = d3.select("#tube-map").selectAll(".river");

            interchanges.style("visibility", "hidden");

            // Shrink the map to a strip for the straightened line and let the
            // page scroll so the station charts below it are reachable
            lineModeActive = true;
            d3.select('body').classed('line-mode', true);
            d3.select('#container').attr('height', 200);
            d3.select('.stationWrapper')
                .call(zoom$$1.transform, d3.zoomIdentity)
                .attr("transform", "translate(5,-100)");


            lines.style("visibility", function (e) {
                return (e.title === name) ? "visible" : "hidden";
            });

            stations.style("visibility", function (e) {
                return (e.title === name) ? "visible" : "hidden";
            });

            labels.style("visibility", function (e) {
                return (e.title === name) ? "visible" : "hidden";
            });

            river.style("visibility", "hidden");
        };

        map.setTimeStop = function () {
            map.timeStop = false;
        };

        map.endTimer = function () {
            map.timeStop = true;
        };

        /**
         * "A Day on the Tube" animation.
         * @param csvData   rows of RODS_2016/Misc/Stationflows/AEI-Summary.csv
         * @param timeTable list of "HH:MM" strings, one per animation tick (minute)
         * @param stationData stations.json contents
         * @param type      "both" | "entry" | "exit"
         * @param onFinish  called once the animation has stopped
         */
        map.startTimer = async function (csvData, timeTable, stationData, type, onFinish) {
            var lines = d3.select("#tube-map").selectAll(".line");
            var river = d3.select("#tube-map").selectAll(".river");
            var formatCount = d3.format(",");

            map.timeStop = false;
            river.style("visibility", "hidden");
            lines.style("opacity", 0.5);
            d3.select("#circlekey").style("display", "inline");

            var kinds = type === "both" ? ["entry", "exit"] : [type];
            var journeyKind = type === "exit" ? "exit" : "entry";
            var timeData = setTimeData(csvData, stationData);

            // One entry and/or exit circle per station, drawn on top of the map
            var circleData = [];
            model.stations.toArray().forEach(function (station) {
                if (station.x === undefined || !timeData.has(station.name)) return;
                kinds.forEach(function (kind) {
                    circleData.push({key: station.name, kind: kind, x: station.x, y: station.y});
                });
            });

            d3.select("#tube-map").selectAll(".timeCircles").remove();
            var circles = gEnter.append("g").attr("class", "timeCircles")
                .selectAll("circle")
                .data(circleData)
                .join("circle")
                .attr("class", function (d) { return "time_circle " + d.kind; })
                .attr("r", 6)
                .attr("cx", function (d) { return xScale(d.kind === "entry" ? d.x + 1 : d.x - 1); })
                .attr("cy", function (d) { return yScale(d.y); })
                .style("fill", function (d) { return d.kind === "entry" ? "red" : "#00A4A7"; })
                .style("pointer-events", "none");

            var finish = function () {
                clearInterval(map.timer);
                map.timer = null;
                river.style("visibility", "visible");
                d3.select("#tube-map").selectAll(".timeCircles").remove();
                lines.style("opacity", 1);
                d3.select("#circlekey").style("display", "none");
                d3.select("#journey").text("");
                d3.select("#clock").text("");
                if (onFinish) onFinish();
            };

            // Ten second countdown before the clock starts
            for (var remaining = 10; remaining > 0; remaining--) {
                if (map.timeStop) return finish();
                d3.select("#clock").text("Departing in " + remaining + " sec");
                await new Promise(function (r) { setTimeout(r, 1000); });
            }
            if (map.timeStop) return finish();

            // Radius is the share of the station's daily total in this 15 min slot
            // (interchanges count towards both entries and exits)
            var radiusFor = function (main, interchange, time) {
                if (!main || main[time] === undefined || main[time] === "") return 0;
                var num = +main[time] + (interchange && interchange[time] ? +interchange[time] : 0);
                return d3.scaleLinear().domain([0, +main.Total]).range([2, 300])(num) || 0;
            };

            var tick = 0;
            map.timer = setInterval(function () {
                var time = timeTable[tick];

                if (map.timeStop || time === undefined || time === "04:45") {
                    return finish();
                }

                d3.select("#clock").style("color", "#F7F122").text(time);

                // The survey data is in 15 minute buckets
                if (tick % 15 === 0) {
                    var journeys = 0;
                    timeData.forEach(function (d) {
                        var rows = d[journeyKind];
                        if (rows[0] && rows[0][time]) journeys += +rows[0][time];
                    });
                    d3.select("#journey").text(formatCount(journeys) + " Journeys");

                    circles.transition().ease(d3.easeSin).duration(1000).attr("r", function (c) {
                        var d = timeData.get(c.key);
                        var main = c.kind === "entry" ? d.entry[0] : d.exit[0];
                        return radiusFor(main, d.interchange[0], time);
                    });
                }

                tick++;
            }, 50);
        };

        map.stopTubeTimer = function () {
            map.endTimer();
        };

        map.unhighlightAll = function () {

            lineModeActive = false;
            d3.select('body').classed('line-mode', false);
            window.scrollTo(0, 0);
            d3.select('#container').attr('height', 1024);
            d3.select('.stationWrapper').attr('transform', null);
            d3.select('.legendWrapper').style('display', 'inline')
            d3.select('.lineMode').classed('showMe', false);
            hideSurvey();
            d3.select('.barChartDropDown').classed('showMe', false);
            d3.select("#circlekey").style("display", "none");

              d3.selectAll('.selectLeft').remove();
              d3.selectAll('select').attr('display', "inline")

            var lines = d3.select("#tube-map").selectAll(".line");
            var lines = d3.select("#tube-map").selectAll(".line");
            var stations = d3.select("#tube-map").selectAll(".station");
            var labels = d3.select("#tube-map").selectAll(".labels");
            var river = d3.select("#tube-map").selectAll(".river");

            var interchanges = d3.select("#tube-map").selectAll(".interchanges");

            interchanges.style("visibility", "visible");

            lines.style("visibility", "visible");
            stations.style("visibility", "visible");
            labels.style("visibility", "visible");
            river.style("visibility", "visible");
        };

        map.unhighlightLine = function () {
            this.unhighlightAll();
        };

        map.highlightNearestStation = function (name) {
            var station = model.stations.stations[name];
        };

        map.centerOnPub = function (name) {
            if (name === undefined) return;

            var station = model.stations.stations[name];

            var width = window.innerWidth;
            var height = window.innerHeight;

            var scale = 2;

            t = [-scale * xScale(station.x) + width / 2, -scale * yScale(station.y) + height / 2];

            // FIXME: Need valid d3 v4 syntax for zooming
            zoom$$1.translateBy(t).scaleTo(2);
            gEnter.transition().duration(750).attr("transform", "translate(" + t[0] + "," + t[1] + ")scale(" + scale + ")");
        };

        map.addStation = function (name) {
            visitStation(name, true);
        };

        map.removeStation = function (name) {
            visitStation(name, false);
        };

        map.visitStations = function (visited) {
            d3.selectAll(".labels").select("text").classed("highlighted", false);
            visited.map(function (pub) {
                visitStation(pub, true);
            });
        };

        map.on = function (event$$1, callback) {
            dispatch$$1.on(event$$1, callback);
        };

        map.selectStation = function (name) {
            selectStation(name);
        };

        // Station keys can contain characters such as "&", so escape them for CSS selectors
        function selectStation(name) {
            d3.select(".labels").selectAll(".label").classed("selected", false);
            d3.select(".labels").select("#" + CSS.escape(name)).classed("selected", true);
        }

        function visitStation(name, highlighted) {
            d3.select(".labels").select("#" + CSS.escape(name)).select("text").classed("highlighted", highlighted);
        }

        // Group the AEI (Access/Egress/Interchange) survey rows by station key
        function setTimeData(csvData, stationData) {
            var resolve = TubeData.stationIndex(stationData.stations);
            var byStation = new Map();
            csvData.forEach(function (row) {
                var kind = {A: "entry", E: "exit", I: "interchange"}[(row.AEI || "").trim()];
                if (!kind) return;
                resolve(row.StartStn).forEach(function (key) {
                    if (!byStation.has(key)) byStation.set(key, {entry: [], exit: [], interchange: []});
                    byStation.get(key)[kind].push(row);
                });
            });
            return byStation;
        }

  function drawLine(data) {
    var path = "";

            var lineNodes = data.nodes;

            var unitLength = xScale(1) - xScale(0);

            var shiftCoords = [data.shiftCoords[0] * lineWidth / unitLength, data.shiftCoords[1] * lineWidth / unitLength];

            var lastSectionType = "diagonal"; // TODO: HACK

            var nextNode, currNode, xDiff, yDiff;
            var points;

            for (var lineNode = 0; lineNode < lineNodes.length; lineNode++) {
                if (lineNode > 0) {
                    nextNode = lineNodes[lineNode];
                    currNode = lineNodes[lineNode - 1];

                    var direction = "";

                    xDiff = Math.round(currNode.coords[0] - nextNode.coords[0]);
                    yDiff = Math.round(currNode.coords[1] - nextNode.coords[1]);

                    var lineEndCorrection = [0, 0];

                    if (lineNode === lineNodes.length - 1) {
                        if (xDiff == 0 || yDiff == 0) {
                            if (xDiff > 0) lineEndCorrection = [-lineWidth / (4 * unitLength), 0];
                            if (xDiff < 0) lineEndCorrection = [lineWidth / (4 * unitLength), 0];
                            if (yDiff > 0) lineEndCorrection = [0, -lineWidth / (4 * unitLength)];
                            if (yDiff < 0) lineEndCorrection = [0, lineWidth / (4 * unitLength)];
                        } else {
                            var sqrt2 = Math.sqrt(2);

                            if (xDiff > 0 && yDiff > 0) lineEndCorrection = [-lineWidth / (4 * unitLength * sqrt2), -lineWidth / (4 * unitLength * sqrt2)];
                            if (xDiff > 0 && yDiff < 0) lineEndCorrection = [-lineWidth / (4 * unitLength * sqrt2), lineWidth / (4 * unitLength * sqrt2)];
                            if (xDiff < 0 && yDiff > 0) lineEndCorrection = [lineWidth / (4 * unitLength * sqrt2), -lineWidth / (4 * unitLength * sqrt2)];
                            if (xDiff < 0 && yDiff < 0) lineEndCorrection = [lineWidth / (4 * unitLength * sqrt2), lineWidth / (4 * unitLength * sqrt2)];
                        }
                    }

                    points = [[xScale(currNode.coords[0] + shiftCoords[0]), yScale(currNode.coords[1] + shiftCoords[1])], [xScale(nextNode.coords[0] + shiftCoords[0] + lineEndCorrection[0]), yScale(nextNode.coords[1] + shiftCoords[1] + lineEndCorrection[1])]];

                    if (xDiff == 0 || yDiff == 0) {
                        lastSectionType = "udlr";
                        path += "L" + points[1][0] + "," + points[1][1];
                    } else if (Math.abs(xDiff) == Math.abs(yDiff) && Math.abs(xDiff) > 1) {
                        lastSectionType = "diagonal";
                        path += "L" + points[1][0] + "," + points[1][1];
                    } else if (Math.abs(xDiff) == 1 && Math.abs(yDiff) == 1) {
                        if (nextNode.dir != null) {
                            direction = nextNode.dir.toLowerCase();
                        }
                        else {
                            direction = "s";
                        }

                        switch (direction) {
                            case "e":
                                path += "Q" + points[1][0] + "," + points[0][1] + "," + points[1][0] + "," + points[1][1];
                                break;
                            case "s":
                                path += "Q" + points[0][0] + "," + points[1][1] + "," + points[1][0] + "," + points[1][1];
                                break;
                            case "n":
                                path += "Q" + points[0][0] + "," + points[1][1] + "," + points[1][0] + "," + points[1][1];
                                break;
                            case "w":
                                path += "Q" + points[1][0] + "," + points[0][1] + "," + points[1][0] + "," + points[1][1];
                                break;
                        }
                    } else if (Math.abs(xDiff) == 1 && Math.abs(yDiff) == 2 || Math.abs(xDiff) == 2 && Math.abs(yDiff) == 1) {
                        var controlPoints;
                        if (xDiff == 1) {
                            if (lastSectionType == "udlr") {
                                controlPoints = [points[0][0], points[0][1] + (points[1][1] - points[0][1]) / 2];
                            } else if (lastSectionType == "diagonal") {
                                controlPoints = [points[1][0], points[0][1] + (points[1][1] - points[0][1]) / 2];
                            }
                        } else if (xDiff == -1) {
                            if (lastSectionType == "udlr") {
                                controlPoints = [points[0][0], points[0][1] + (points[1][1] - points[0][1]) / 2];
                            } else if (lastSectionType == "diagonal") {
                                controlPoints = [points[1][0], points[0][1] + (points[1][1] - points[0][1]) / 2];
                            }
                        } else if (xDiff == -2) {
                            if (lastSectionType == "udlr") {
                                controlPoints = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[0][1]];
                            } else if (lastSectionType == "diagonal") {
                                controlPoints = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[1][1]];
                            }
                        } else if (xDiff == 2) {
                            if (lastSectionType == "udlr") {
                                controlPoints = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[0][1]];
                            } else if (lastSectionType == "diagonal") {
                                controlPoints = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[1][1]];
                            }
                        }

                        path += "C" + controlPoints[0] + "," + controlPoints[1] + "," + controlPoints[0] + "," + controlPoints[1] + "," + points[1][0] + "," + points[1][1];
                    }
                } else {
                    nextNode = lineNodes[lineNode + 1];
                    currNode = lineNodes[lineNode];

                    xDiff = Math.round(currNode.coords[0] - nextNode.coords[0]);
                    yDiff = Math.round(currNode.coords[1] - nextNode.coords[1]);

                    var lineStartCorrection = [0, 0];

                    if (xDiff == 0 || yDiff == 0) {
                        if (xDiff > 0) lineStartCorrection = [lineWidth / (4 * unitLength), 0];
                        if (xDiff < 0) lineStartCorrection = [-lineWidth / (4 * unitLength), 0];
                        if (yDiff > 0) lineStartCorrection = [0, lineWidth / (4 * unitLength)];
                        if (yDiff < 0) lineStartCorrection = [0, -lineWidth / (4 * unitLength)];
                    } else {
                        var sqrt2 = Math.sqrt(2);
                        if (xDiff > 0 && yDiff > 0) lineStartCorrection = [lineWidth / (4 * unitLength * sqrt2), lineWidth / (4 * unitLength * sqrt2)];
                        if (xDiff > 0 && yDiff < 0) lineStartCorrection = [lineWidth / (4 * unitLength * sqrt2), -lineWidth / (4 * unitLength * sqrt2)];
                        if (xDiff < 0 && yDiff > 0) lineStartCorrection = [-lineWidth / (4 * unitLength * sqrt2), lineWidth / (4 * unitLength * sqrt2)];
                        if (xDiff < 0 && yDiff < 0) lineStartCorrection = [-lineWidth / (4 * unitLength * sqrt2), -lineWidth / (4 * unitLength * sqrt2)];
                    }

                    points = [xScale(currNode.coords[0] + shiftCoords[0] + lineStartCorrection[0]), yScale(currNode.coords[1] + shiftCoords[1] + lineStartCorrection[1])];

                    path += "M" + points[0] + "," + points[1];
                }
            }

            return path;
        }

        function mangleData(data) {
            var mangledData = {};

            // Data manipulation
            mangledData.raw = data.lines;
            mangledData.river = data.river;
            mangledData.stations = extractStations(data);
            mangledData.lines = extractLines(data.lines);

            return mangledData;
        }

        function extractStations(data) {

            data.lines.forEach(function (line$$1) {
                for (var node = 0; node < line$$1.nodes.length; node++) {
                    var d = line$$1.nodes[node];

                    if (!d.hasOwnProperty("name")) continue;

                    if (!data.stations.hasOwnProperty(d.name)) throw new Error("Cannot find station with key: " + d.name);

                    var station = data.stations[d.name];


                    station.x = d.coords[0];
                    station.y = d.coords[1];

                    if (station.labelPos === undefined) {
                        station.labelPos = d.labelPos;
                        station.labelShiftX = d.hasOwnProperty("shiftCoords") ? d.shiftCoords[0] : line$$1.shiftCoords[0];
                        station.labelShiftY = d.hasOwnProperty("shiftCoords") ? d.shiftCoords[1] : line$$1.shiftCoords[1];
                    }

                    if (d.hasOwnProperty("canonical")) {
                        station.labelShiftX = d.hasOwnProperty("shiftCoords") ? d.shiftCoords[0] : line$$1.shiftCoords[0];
                        station.labelShiftY = d.hasOwnProperty("shiftCoords") ? d.shiftCoords[1] : line$$1.shiftCoords[1];
                        station.labelPos = d.labelPos;
                    }
                    station.label = data.stations[d.name].title;
                    station.text = data.stations[d.name].text;
                    station.position = data.stations[d.name].position;
                    station.visited = false;

                    if (!d.hide) {

                        station.marker = station.marker || [];

                        station.marker.push({
                            "line": line$$1.name,
                            "color": line$$1.color,
                            "labelPos": d.labelPos,
                            "marker": d.hasOwnProperty("marker") ? d.marker : "station",
                            "shiftX": d.hasOwnProperty("shiftCoords") ? d.shiftCoords[0] : line$$1.shiftCoords[0],
                            "shiftY": d.hasOwnProperty("shiftCoords") ? d.shiftCoords[1] : line$$1.shiftCoords[1]
                        });
                    }
                }
            });

            return new Stations(data.stations);
        }

        function extractLines(data) {
            var lines = [];

            data.forEach(function (line$$1) {

                var lineObj = {
                    "name": line$$1.name,
                    "title": line$$1.label,
                    "stations": [],
                    "color": line$$1.color,
                    "shiftCoords": line$$1.shiftCoords,
                    "nodes": line$$1.nodes,
                    "highlighted": false
                };

                lines.push(lineObj);

                for (var node = 0; node < line$$1.nodes.length; node++) {
                    var data = line$$1.nodes[node];

                    if (!data.hasOwnProperty("name")) continue;

                    lineObj.stations.push(data.name);
                }
            });

            return new Lines(lines);
        }

        function textPos(data) {
            var pos;
            var textAnchor;
            var offset = lineWidth * 2;

            var numLines = 0;
            if(data.text != null){

            numLines = data.text.split('\n').length;
          }
          else{
            numLines = data.name.split('\n').length;
          }


            var sqrt2 = Math.sqrt(2);

            switch (data.labelPos.toLowerCase()) {
                case "n":
                if(numLines != 1){
                  pos = [0, lineWidth * (numLines) + offset];
                  textAnchor = "middle";
                }
                else{
                  pos = [0, lineWidth * (numLines-1) + offset];
                  textAnchor = "middle";
                }

                    break;
                case "ne":
                    pos = [offset / sqrt2, (lineWidth * (numLines -1) + offset) / sqrt2];
                    textAnchor = "start";
                    break;
                case "e":
                    pos = [lineWidth*1.8, 0];
                    textAnchor = "start";
                    break;
                case "se":
                    pos = [offset / sqrt2, -offset / sqrt2];
                    textAnchor = "start";
                    break;
                case "s":
                    pos = [0, -lineWidthMultiplier * offset];
                    textAnchor = "middle";
                    break;
                case "sw":
                    pos = [-offset / sqrt2, -1.4 * offset / sqrt2];
                    textAnchor = "end";
                    break;
                case "w":
                    pos = [-offset, 0];
                    textAnchor = "end";
                    break;
                case "nw":
                    pos = [-(lineWidth * (numLines - 1) + offset) / sqrt2, (lineWidth * (numLines - 1) + offset) / sqrt2];
                    textAnchor = "end";
                    break;
                default:
                    break;
            }

            return {
                "pos": pos,
                "textAnchor": textAnchor
            };
        }

        // Render line breaks for svg text
        function wrap(text) {
            text.each(function () {
                var text = d3.select(this);
                var lines = text.text().split(/\n/);

                var y = text.attr("y");
                var x = text.attr("x");
                var dy = parseFloat(text.attr("dy"));

                var tspan = text.text(null).append("tspan").attr("x", x).attr("y", y).attr("dy", dy + "em").text(lines[0]);

                for (var lineNum = 1; lineNum < lines.length; lineNum++) {
                    tspan = text.append("tspan").attr("x", x).attr("y", y).attr("dy", lineNum * 1.1 + dy + "em").text(lines[lineNum]);
                }
            });
        }

        return map;
    }

    var Stations = function Stations(stations) {
        this.stations = stations;
    };

    Stations.prototype.toArray = function () {
        var stations = [];

        for (var name in this.stations) {
            if (this.stations.hasOwnProperty(name)) {
                var station = this.stations[name];
                station.name = name;
                stations.push(station);
            }
        }

        return stations;
    };

    Stations.prototype.interchanges = function () {
        var interchangeStations = this.toArray();
        return interchangeStations.filter(function (station) {
            return station.marker[0].marker === "interchange";
        });
    };

    Stations.prototype.normalStations = function () {
        var stations = this.toArray();

        var stationStations = stations.filter(function (station) {
            return station.marker[0].marker !== "interchange";
        });

        var stationMarkers = [];

        stationStations.forEach(function (station) {
            station.marker.forEach(function (marker) {
                stationMarkers.push({
                    "name": station.name,
                    "line": marker.line,
                    "x": station.x,
                    "y": station.y,
                    "color": marker.color,
                    "shiftX": marker.shiftX,
                    "shiftY": marker.shiftY,
                    "labelPos": station.labelPos
                });
            });
        });

        return stationMarkers;
    };

    Stations.prototype.visited = function () {
        var visitedStations = this.toArray();

        return visitedStations.filter(function (station) {
            return station.visited;
        });
    };

    Stations.prototype.visitedFriendly = function () {
        var visitedStations = this.visited();

        return visitedStations.map(function (station) {
            return station.title;
        });
    };

    Stations.prototype.isVisited = function (name) {
        return this.stations[name].visited;
    };

    var Lines = function Lines(lines) {
        this.lines = lines;
    };

    Lines.prototype.highlightLine = function (name) {
        this.lines.forEach(function (line$$1) {
            if (line$$1.name === name) {
                line$$1.highlighted = true;
            }
        });
    };

    Lines.prototype.unhighlightLine = function (name) {
        this.lines.forEach(function (line$$1) {
            if (line$$1.name === name) {
                line$$1.highlighted = false;
            }
        });
    };

    exports.tubeMap = tubeMap;

    Object.defineProperty(exports, '__esModule', {value: true});

})));
