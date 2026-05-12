// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoibmFpbmlrYTA5IiwiYSI6ImNtcDBsa3NycDB5M3gyc29wN2kydmZqdnIifQ.9g67WGIn3oob8C3G_pHQ-w';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// Select SVG overlay
const svg = d3.select('#map').select('svg');

// Convert station coordinates to screen coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(
    +station.lon,
    +station.lat
  );

  const { x, y } = map.project(point);

  return { cx: x, cy: y };
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);

  return date.toLocaleString('en-US', {
    timeStyle: 'short',
  });
}

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.start_station_id,
  );

  const arrivals = d3.rollup(
    trips,
    (v) => v.length,
    (d) => d.end_station_id,
  );

  return stations.map((station) => {
    let id = station.short_name;

    station.arrivals = arrivals.get(id) ?? 0;

    station.departures = departures.get(id) ?? 0;

    station.totalTraffic =
      station.arrivals + station.departures;

    return station;
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1
    ? trips
    : trips.filter((trip) => {
        const startedMinutes =
          minutesSinceMidnight(trip.started_at);

        const endedMinutes =
          minutesSinceMidnight(trip.ended_at);

        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
      });
}


map.on('load', async () => {

  // Add Boston bike lane data
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  // Draw the bike lanes
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 4,
      'line-opacity': 0.6,
    },
  });

  // Cambridge bike lanes source
  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  }); 

// Cambridge bike lane layer
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: {
      'line-color': '#32D400',
      'line-width': 4,
      'line-opacity': 0.6,
    },
  });

  let jsonData;

  try {
    const jsonurl =
      'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

    // Load JSON data
    jsonData = await d3.json(jsonurl);

    console.log('Loaded JSON Data:', jsonData);

    // Get stations array
    let stations = jsonData.data.stations;


    // Load bike traffic CSV
  const trips = await d3.csv(
  'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
  (trip) => {
    trip.started_at = new Date(trip.started_at);

    trip.ended_at = new Date(trip.ended_at);

    return trip;
  }
);

console.log('Trips data:', trips);

stations = computeStationTraffic(stations, trips);

// Scale circle size based on traffic
  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

 let stationFlow = d3
  .scaleQuantize()
  .domain([0, 1])
  .range([0, 0.5, 1]);



    // Append circles for each station
  const circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .style('--departure-ratio', (d) =>
        stationFlow(d.departures / d.totalTraffic)
      )
    .each(function (d) {
      d3.select(this)
          .append('title')
          .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
          );
});

    // Update circle positions
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx)
      .attr('cy', (d) => getCoords(d).cy);
  }

// Initial positioning
updatePositions();

// Reposition circles during map interactions
  map.on('move', updatePositions);

  map.on('zoom', updatePositions);

  map.on('resize', updatePositions);

  map.on('moveend', updatePositions);

  const timeSlider = document.getElementById('time-slider');

  const selectedTime = document.getElementById('selected-time');

  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value);

    if (timeFilter === -1) {
      selectedTime.textContent = '';

      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);

      anyTimeLabel.style.display = 'none';
    }

    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);

  updateTimeDisplay();

  function updateScatterPlot(timeFilter) {
  const filteredTrips =
    filterTripsbyTime(trips, timeFilter);

  const filteredStations =
    computeStationTraffic(stations, filteredTrips);

  timeFilter === -1
    ? radiusScale.range([0, 25])
    : radiusScale.range([3, 50]);

  circles
    .data(filteredStations, (d) => d.short_name)
    .join('circle')
    .attr('r', (d) =>
      radiusScale(d.totalTraffic)
    )
    .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic)
    );
}


  console.log('Stations Array:', stations);

  } catch (error) {
    console.error('Error loading JSON:', error);
  }
  

});