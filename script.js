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
}


function onDone() {
    let quality = document.getElementById("quality").value
    let uColor = document.getElementById("unique-color").checked
    let opacity = document.getElementById("opacity").checked
    let arrows = document.getElementById("arrows").checked
    const trackHoverEl = document.getElementById("track-hover")
    for (let i = 0; i < allPaths.length; i++) {
        let path = simplify(allPaths[i], quality, true)
        let j = i * 12
        let color = uColor ? `hsl(${j},${j / 360 / 10 + 65}%,50%)` : "#ff8800"
        let _opacity = opacity ? 0.5 : 1
        let polyline = L.polyline(path, { color, opacity: _opacity })
        if (arrows){
            polyline = polyline.arrowheads({
                size: '10px',
                frequency: '180px'
            });}
        
        polyline = polyline
            .addTo(map);

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

    // for(let i=0;i<allPaths.length;i++) {
    //     let coordinates = allPaths[i]
    //     const terrainData = coordinates.map(async (coordinate, index) => {
    //         const longitude = coordinate[0];
    //         const latitude = coordinate[1];
    //         const terrain = await getTerrainData(longitude, latitude);

    //         return {
    //           elevation: terrain.elevation,
    //           type: terrain.tags.get("landuse"),
    //         };
    //       });

    //       const statistics = {
    //         residential: 0,
    //         water: 0,
    //         forest: 0,
    //         coastline: 0,
    //         nature_reserve: 0,
    //         unclassified: 0,
    //       };

    //       terrainData.forEach((terrain) => {
    //         const type = terrain.type;

    //         if (type === "residential") {
    //           statistics.residential++;
    //         } else if (type === "water") {
    //           statistics.water++;
    //         } else if (type === "forest") {
    //           statistics.forest++;
    //         } else if (type === "coastline") {
    //           statistics.coastline++;
    //         } else if (type === "nature_reserve") {
    //           statistics.nature_reserve++;
    //         } else if (type === "unclassified") {
    //           statistics.unclassified++;
    //         }
    //       });
    // }

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
