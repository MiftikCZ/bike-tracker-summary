config = {
    locateFile: filename => `./${filename}`
}

var map
let selectedDbFile
let bufferAllPaths
const fileInput = document.getElementById('file');
const statsData = {
    "maxspeed": undefined
}

const worker = new Worker("./worker.sql-wasm.js");
const allPaths = []
worker.onmessage = () => {
    console.log("Database opened");
    worker.onmessage = event => {
        if (event.data.id.startsWith("session-")) {
            allPaths.push(event.data.results[0].values)
            if (event.data.id.endsWith("-end")) {
                onDone()
            }
        }

        if (event.data.id.startsWith("setstats-")) {
            let val = event.data.id.replace("setstats-", "")
            statsData[val] = event.data.results[0].values
            console.log(statsData)
        }

        if (event.data.id == "sessions-ids") {
            console.log("session ids")
            let temp0 = event.data.results[0].values

            for (let i = 0; i < temp0.length; i++) {
                let id = temp0[i][0]
                let idend = temp0.length == i + 1

                worker.postMessage({
                    id: "session-" + id + (idend ? "-end" : ""),
                    action: "exec",
                    sql: `SELECT DISTINCT latitude, longitude
                    FROM TrackingPoint
                    WHERE sessionid = $id
                    ORDER BY timestamp ASC;
                    `,
                    params: { "$id": id }
                });
            }
        }

        if (event.data.id == "put-averange-marker" && document.getElementById("avgmark").checked) {
            let [lat,lon] = event.data.results[0].values[0]
            L.marker([lat,lon])
            .addTo(map)
            .bindPopup('Average point')
        }

        if (event.data.id == "stats-getfastestsession-id") {
            let [sessionId, maxAvgSpeed] = event.data.results[0].values[0]
            console.log(sessionId, maxAvgSpeed)
        }
    };

    worker.postMessage({
        id: "sessions-ids",
        action: "exec",
        sql: "SELECT DISTINCT sessionid FROM TrackingPoint"
    })
};

worker.onerror = e => console.log("Worker error: ", e);
fileInput.onchange = () => {
    const f = fileInput.files[0];
    const r = new FileReader();
    r.onload = function () {
        worker.postMessage({
            id: 1,
            action: "open",
            buffer: (r.result),
        });
    }
    r.readAsArrayBuffer(f);
}

function componentToHex(c) {
    let hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}
function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

const HSLToRGB = (h, s, l) => {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n =>
        l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex(255 * f(0), 255 * f(8), 255 * f(4));
}


var map = L.map('map', {
    fullscreenControl: true,
}).setView([49.372, 15.084], 7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);


function onDoneStats() {
    worker.postMessage({
        id: `setstats-maxspeed`,
        action: "exec",
        sql: `SELECT MAX(maxspeed * 3.6) AS maxsspeed from TrackingPoint`
    })

    worker.postMessage({
        id: "setstats-minmaxalt",
        action: "exec",
        sql: `SELECT MAX(altitude) AS maxalt, MIN(altitude) as minalt from TrackingPoint`
    })

    worker.postMessage({
        id: "stats-getfastestsession-id",
        action: "exec",
        sql: `SELECT sessionid, MAX(averageSpeed * 3.6) AS maxavgspeed FROM TrackingPoint`
    })
    
    worker.postMessage({
        id: "put-averange-marker",
        action: "exec",
        sql: `SELECT AVG(latitude),AVG(longitude) FROM TrackingPoint`
    })
}

function loadHeatmap(allPaths) {
  const latlngs = allPaths.flatMap((path) => path.map(([lat, lng]) => L.latLng(lat, lng)));
  let heatmapEl = document.getElementById("heatmap")
  const radius = document.getElementById("hradius")
    let options = {
        blur: 15,
        gradient: {
          0.4: 'blue',
          0.65: 'lime',
          1: 'red',
        },
    }
  const heatmapLayer = L.heatLayer(latlngs, {
    radius:parseInt(radius.value),...options
  });

  if(heatmapEl.checked) heatmapLayer.addTo(map)

  document.getElementById("hradius").onchange = () => {
    heatmapLayer.setOptions({
        radius:parseInt(radius.value),
       ...options 
    })
  }

  heatmapEl.onchange = () => {
    let ch = heatmapEl.checked
    if(ch) {
        heatmapLayer.addTo(map)
    } else {
        heatmapLayer.removeFrom(map)
    }
  }
}

function onDone() {
    let quality = document.getElementById("quality").value
    // let uColor = document.getElementById("unique-color").checked
    let uColor, opacity = false
    // let opacity = document.getElementById("opacity").checked
    let arrows = document.getElementById("arrows").checked
    let layers = L.layerGroup([])
    for (let i = 0; i < allPaths.length; i++) {
        let path = simplify(allPaths[i], quality, true)
        let j = i * 12
        let color = "#ff8800"
        let _opacity = opacity ? 0.5 : 1
        let polyline = L.polyline(path, { color, opacity: _opacity })
        if (arrows){
            polyline = polyline.arrowheads({
                size: '10px',
                frequency: '180px'
            });}
        
        polyline = polyline

        layers.addLayer(polyline)

        polyline.on('mouseover', () => {
            // trackHoverEl.innerText = i
            polyline.setStyle({
                color: "#000"
            })
            polyline.bringToFront()
        })
        polyline.on("mouseout", () => {
            polyline.setStyle({
                color
            })
        })
    }

    const linesEl = document.getElementById("lines")
    if(linesEl.checked) layers.addTo(map)

    linesEl.onchange = () => {
      let ch = linesEl.checked
      if(ch) {
        layers.addTo(map)
      } else {
        layers.removeFrom(map)
      }
    }

    loadHeatmap(allPaths)

    onDoneStats()
}

const mapEl = document.getElementById("map")
const statsEl = document.getElementById("stats")

document.querySelectorAll("input[name='view']").forEach(el => {
    el.oninput = () => {
        console.log("eej!")
        let selectedView = document.querySelector('input[name="view"]:checked').value

        if (selectedView == "map") {
            mapEl.hidden = false
            statsEl.hidden = true
        } else {
            mapEl.hidden = true
            statsEl.hidden = false
        }
    }
})
