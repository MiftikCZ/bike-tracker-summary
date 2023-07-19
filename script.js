config = {
    locateFile: filename => `./${filename}`
}

var map
let selectedDbFile
const fileInput = document.getElementById('file');

const worker = new Worker("/worker.sql-wasm.js");
const allPaths = []
worker.onmessage = () => {
    console.log("Database opened");
    worker.onmessage = event => {
        if (event.data.id.startsWith("session-")) {
            allPaths.push(event.data.results[0].values)
            if (event.data.id.endsWith("-end")) {
                onDone(allPaths)
            }
        }

        if (event.data.id == "sessions-ids") {
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
                    ORDER BY timestamp DESC;
                    `,
                    params: { "$id": id }
                });
            }
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
            buffer: (r.result), /*Optional. An ArrayBuffer representing an SQLite Database file*/
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
}).setView([49.372,15.084], 7);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);
function onDone(allPaths) {
    let quality = document.getElementById("quality").value
    let uColor = document.getElementById("unique-color").checked
    let opacity = document.getElementById("opacity").checked
    const trackHoverEl = document.getElementById("track-hover")
    for(let i=0;i<allPaths.length;i++) {
        let path = simplify(allPaths[i],quality,true)
        let j = i*12
        let color = uColor ? `hsl(${j},${j/360/10 + 65}%,50%)` : "#ff8800"
        let _opacity = opacity ? 0.5 : 1
        let polyline = L.polyline(path,{color,opacity:_opacity})
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
}

const mapEl = document.getElementById("map")
const statsEl = document.getElementById("stats")

document.querySelectorAll("input[name='view']").forEach(el => {
    el.oninput = () => {
        console.log("eej!")
        let selectedView = document.querySelector('input[name="view"]:checked').value

        if(selectedView == "map") {
            mapEl.hidden = false
            statsEl.hidden = true
        } else {
            mapEl.hidden = true
            statsEl.hidden = false
        }
    }
})
