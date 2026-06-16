// app.js - Map & Compass Application Logic

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide Icons
    const createIcons = () => {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    };
    createIcons();

    // ── Map Configuration & Setup ─────────────────────────────────────────────
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    
    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)'
    });
    
    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    const darkMatter = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    });

    const voyager = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 20,
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    });

    // Start in Kuala Lumpur, Malaysia as the fallback if location access is unavailable.
    const defaultCenter = [3.1390, 101.6869];
    const map = L.map('map', { 
        tap: false, 
        zoomControl: false, // We'll add custom positioned zoom control
        layers: [osm] 
    }).setView(defaultCenter, 13);

    // Attempt to locate the user on startup
    map.locate({ setView: true, maxZoom: 13 });

    // Add scale and custom layer control
    L.control.layers({ 
        "Road Map (Voyager)": voyager,
        "Standard (OSM)": osm, 
        "Topographic Map": topo, 
        "Satellite Imagery": satellite,
        "Tactical Dark": darkMatter 
    }, null, { position: 'topright' }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);
    L.control.scale({ metric: true, imperial: true, position: 'bottomleft' }).addTo(map);

    // ── Compass Bezel / Ring Generation ──────────────────────────────────────
    const CX = 130, CY = 310, R_OUT = 90;
    const ticksG  = document.getElementById('bezel-ticks');
    const labelsG = document.getElementById('bezel-labels');

    function generateBezel() {
        ticksG.innerHTML = '';
        labelsG.innerHTML = '';
        
        for (let deg = 0; deg < 360; deg++) {
            const rad = (deg - 90) * Math.PI / 180;
            let len = 2.5;
            
            if (deg % 10 === 0) len = 8;
            else if (deg % 5 === 0) len = 5;
            
            const x1 = (CX + R_OUT * Math.cos(rad)).toFixed(2);
            const y1 = (CY + R_OUT * Math.sin(rad)).toFixed(2);
            const x2 = (CX + (R_OUT - len) * Math.cos(rad)).toFixed(2);
            const y2 = (CY + (R_OUT - len) * Math.sin(rad)).toFixed(2);
            
            const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
            line.setAttribute("x1", x1);
            line.setAttribute("y1", y1);
            line.setAttribute("x2", x2);
            line.setAttribute("y2", y2);
            
            if (deg % 10 === 0) {
                line.setAttribute("stroke-width", "1.5");
            } else {
                line.setAttribute("stroke-width", "0.6");
            }
            ticksG.appendChild(line);

            // Print degree labels every 20 degrees, skipping cardinals
            if (deg % 20 === 0 && deg % 90 !== 0) {
                const lr = R_OUT - 15;
                const lx = (CX + lr * Math.cos(rad)).toFixed(2);
                const ly = (CY + lr * Math.sin(rad)).toFixed(2);
                
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", lx);
                text.setAttribute("y", ly);
                text.setAttribute("text-anchor", "middle");
                text.setAttribute("dominant-baseline", "central");
                text.setAttribute("font-size", "7.5");
                text.setAttribute("font-weight", "600");
                text.setAttribute("stroke", "#000");
                text.setAttribute("stroke-width", "2");
                text.setAttribute("paint-order", "stroke");
                text.setAttribute("transform", `rotate(${deg} ${lx} ${ly})`);
                text.textContent = deg;
                
                labelsG.appendChild(text);
            }
        }
    }
    generateBezel();

    // ── State Variables ──────────────────────────────────────────────────────
    const toolBox        = document.getElementById('tool-box');
    const capsuleCounter = document.getElementById('capsule-counter');
    const bearingDisp    = document.getElementById('bearing-display');
    const rotHandle      = document.getElementById('rotate-handle');
    const svgEl          = document.getElementById('compass-svg');

    // Compass Screen coordinates
    let posX = window.innerWidth / 2;
    let posY = window.innerHeight / 2;
    let toolRot = 0; // Rotation angle in degrees
    let currentScale = window.innerWidth <= 768 ? 0.65 : 1;
    document.documentElement.style.setProperty('--compass-scale', currentScale);
    
    // Geographical anchor coordinates (so it moves with the map)
    let anchorLatLng = map.containerPointToLatLng([posX, posY]);

    // ── Transform & Repositioning Logic ─────────────────────────────────────
    
    // Updates position of the DOM compass and triggers overlay updates
    function applyTransform() {
        toolBox.style.transform = `translate(${posX - (CX * currentScale)}px, ${posY - (CY * currentScale)}px) rotate(${toolRot}deg)`;
        capsuleCounter.setAttribute('transform', `rotate(${-toolRot} ${CX} ${CY})`);

        const bearing = ((toolRot % 360) + 360) % 360;
        const mils = Math.round(bearing * (6400 / 360));
        bearingDisp.textContent = `${bearing.toFixed(1)}° / ${mils} mil`;

        // Update anchor coordinate to follow compass pivot point
        const latlng = map.containerPointToLatLng([posX, posY]);
        anchorLatLng = latlng;
        
        updateCoordinateDisplays(latlng);
    }

    // Move compass DOM element only (used during map panning to prevent recursive calculations)
    function applyTransformOnly() {
        toolBox.style.transform = `translate(${posX - (CX * currentScale)}px, ${posY - (CY * currentScale)}px) rotate(${toolRot}deg)`;
        capsuleCounter.setAttribute('transform', `rotate(${-toolRot} ${CX} ${CY})`);
        
        const bearing = ((toolRot % 360) + 360) % 360;
        const mils = Math.round(bearing * (6400 / 360));
        bearingDisp.textContent = `${bearing.toFixed(1)}° / ${mils} mil`;
        
        // Re-read geographic position underneath compass
        const latlng = map.containerPointToLatLng([posX, posY]);
        updateCoordinateDisplays(latlng);
    }

    function toDMS(deg, isLat) {
        const dir = deg < 0 ? (isLat ? 'S' : 'W') : (isLat ? 'N' : 'E');
        const absDeg = Math.abs(deg);
        const d = Math.floor(absDeg);
        const m = Math.floor((absDeg - d) * 60);
        const s = ((absDeg - d - m / 60) * 3600).toFixed(1);
        return `${d}° ${m}' ${s}" ${dir}`;
    }

    function updateCoordinateDisplays(latlng) {
        const latStr = latlng.lat.toFixed(5);
        const lngStr = latlng.lng.toFixed(5);

        // HUD Overlay
        document.getElementById('latlng-text').textContent = `${latStr}, ${lngStr}`;
        
        // Sidebar Dashboard Panel
        document.getElementById('dash-lat').textContent = `${latStr}°`;
        document.getElementById('dash-lat-dms').textContent = toDMS(latlng.lat, true);
        document.getElementById('dash-lng').textContent = `${lngStr}°`;
        document.getElementById('dash-lng-dms').textContent = toDMS(latlng.lng, false);
        document.getElementById('dash-zoom').textContent = map.getZoom();

        // Calculate Sun Position using SunCalc
        try {
            if (!window.SunCalc) {
                document.getElementById('sun-text').textContent = 'Sun Position: unavailable';
                return;
            }

            const now = new Date();
            const sunPos = window.SunCalc.getPosition(now, latlng.lat, latlng.lng);
            const times = window.SunCalc.getTimes(now, latlng.lat, latlng.lng);
            
            // Azimuth is measured southwards, let's normalize to standard North azimuth (0-360)
            const azimuthDeg = ((sunPos.azimuth * 180 / Math.PI) + 180) % 360;
            const altitudeDeg = sunPos.altitude * 180 / Math.PI;

            const formatTime = (date) => {
                if (!date || isNaN(date.getTime())) return '--:--';
                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            };

            document.getElementById('sun-text').textContent = 
                `Sun Position: Azimuth ${azimuthDeg.toFixed(1)}° | Altitude ${altitudeDeg.toFixed(1)}°`;
            
            document.getElementById('dash-sun-az').textContent = `${azimuthDeg.toFixed(1)}°`;
            document.getElementById('dash-sun-alt').textContent = `${altitudeDeg.toFixed(1)}°`;
            document.getElementById('dash-sunrise').textContent = formatTime(times.sunrise);
            document.getElementById('dash-sunset').textContent = formatTime(times.sunset);
        } catch (e) {
            console.error("SunCalc failed to calculate position", e);
        }
    }

    // ── Dynamic Ruler Scaling Logic ──────────────────────────────────────────
    const rulerLeft = document.getElementById('ruler-left');
    const rulerRight = document.getElementById('ruler-right');
    const rulerTop = document.getElementById('ruler-top');
    const rulerLabels = document.getElementById('ruler-labels');

    // Choose appropriate scale increments based on zoom and latitude
    function getStepSize(metersPerPixel) {
        // Step increments: 1m to 100km
        const steps = [
            1, 2, 5, 10, 20, 50, 100, 200, 500, 
            1000, 2000, 5000, 10000, 20000, 50000, 100000
        ];
        const minPixelsPerLabel = 45; // Avoid overcrowded labels
        
        for (let step of steps) {
            if ((step / metersPerPixel) >= minPixelsPerLabel) {
                return step;
            }
        }
        return 200000;
    }

    function formatDistanceLabel(m) {
        if (m === 0) return "0";
        return (m >= 1000) ? (m / 1000).toFixed(1).replace(/\.0$/, '') + ' km' : m + ' m';
    }

    function drawRulers() {
        // Clear old rulers
        rulerLeft.innerHTML = '';
        rulerRight.innerHTML = '';
        rulerTop.innerHTML = '';
        rulerLabels.innerHTML = '';

        const zoom = map.getZoom();
        const lat = anchorLatLng.lat;
        
        // Physically accurate Web Mercator meters per pixel calculation adjusted for latitude
        const metersPerPixel = (40075016.686 * Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
        
        const stepMeters = getStepSize(metersPerPixel);
        const stepPixels = stepMeters / metersPerPixel;

        // Draw Left and Right rulers (CY=310 is center 0 point, extends up to 12 and down to 378)
        const maxVerticalPx = 300; 
        
        for (let i = 0; i * stepPixels <= maxVerticalPx; i++) {
            const offset = i * stepPixels;
            const dist = i * stepMeters;
            
            // Major ticks at step, minor subdivisions
            const isMajor = true;
            let tickLen = 10;
            
            [CY - offset, CY + offset].forEach((y, index) => {
                if (i === 0 && index > 0) return; // Draw middle tick once
                if (y < 12 || y > 378) return;

                // Left Tick
                const lineL = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineL.setAttribute("x1", "6");
                lineL.setAttribute("y1", y);
                lineL.setAttribute("x2", 6 + tickLen);
                lineL.setAttribute("y2", y);
                rulerLeft.appendChild(lineL);

                // Right Tick
                const lineR = document.createElementNS("http://www.w3.org/2000/svg", "line");
                lineR.setAttribute("x1", "254");
                lineR.setAttribute("y1", y);
                lineR.setAttribute("x2", 254 - tickLen);
                lineR.setAttribute("y2", y);
                rulerRight.appendChild(lineR);

                // Label
                const labelText = formatDistanceLabel(dist);
                const textL = document.createElementNS("http://www.w3.org/2000/svg", "text");
                textL.setAttribute("x", "22");
                textL.setAttribute("y", y + 2.5);
                textL.setAttribute("text-anchor", "start");
                textL.textContent = labelText;
                rulerLabels.appendChild(textL);

                const textR = document.createElementNS("http://www.w3.org/2000/svg", "text");
                textR.setAttribute("x", "238");
                textR.setAttribute("y", y + 2.5);
                textR.setAttribute("text-anchor", "end");
                textR.textContent = labelText;
                rulerLabels.appendChild(textR);
            });

            // Draw 4 sub-division ticks between major ticks (if spaced far enough)
            if (stepPixels >= 30) {
                for (let j = 1; j < 5; j++) {
                    const subOffset = offset + (j * (stepPixels / 5));
                    if (subOffset <= maxVerticalPx) {
                        [CY - subOffset, CY + subOffset].forEach(y => {
                            if (y < 12 || y > 378) return;
                            const subL = document.createElementNS("http://www.w3.org/2000/svg", "line");
                            subL.setAttribute("x1", "6");
                            subL.setAttribute("y1", y);
                            subL.setAttribute("x2", "11");
                            subL.setAttribute("y2", y);
                            rulerLeft.appendChild(subL);

                            const subR = document.createElementNS("http://www.w3.org/2000/svg", "line");
                            subR.setAttribute("x1", "254");
                            subR.setAttribute("y1", y);
                            subR.setAttribute("x2", "249");
                            subR.setAttribute("y2", y);
                            rulerRight.appendChild(subR);
                        });
                    }
                }
            }
        }

        // Draw Top horizontal ruler (CX=130 is 0 point, extends left to 6 and right to 254)
        const maxHorizontalPx = 124; // (130 - 6)
        for (let i = 0; i * stepPixels <= maxHorizontalPx; i++) {
            const offset = i * stepPixels;
            const dist = i * stepMeters;
            
            [CX - offset, CX + offset].forEach((x, index) => {
                if (i === 0 && index > 0) return; // Draw center tick once
                if (x < 6 || x > 254) return;

                const tick = document.createElementNS("http://www.w3.org/2000/svg", "line");
                tick.setAttribute("x1", x);
                tick.setAttribute("y1", "6");
                tick.setAttribute("x2", x);
                tick.setAttribute("y2", "16");
                rulerTop.appendChild(tick);

                const labelText = formatDistanceLabel(dist);
                const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
                text.setAttribute("x", x);
                text.setAttribute("y", "24");
                text.setAttribute("text-anchor", "middle");
                text.textContent = labelText;
                rulerLabels.appendChild(text);
            });

            // Subdivisions for Top Ruler
            if (stepPixels >= 30) {
                for (let j = 1; j < 5; j++) {
                    const subOffset = offset + (j * (stepPixels / 5));
                    if (subOffset <= maxHorizontalPx) {
                        [CX - subOffset, CX + subOffset].forEach(x => {
                            if (x < 6 || x > 254) return;
                            const subTick = document.createElementNS("http://www.w3.org/2000/svg", "line");
                            subTick.setAttribute("x1", x);
                            subTick.setAttribute("y1", "6");
                            subTick.setAttribute("x2", x);
                            subTick.setAttribute("y2", "11");
                            rulerTop.appendChild(subTick);
                        });
                    }
                }
            }
        }
    }

    // Redraw rulers when map moves or zooms (since scale changes!)
    map.on('zoom', drawRulers);
    map.on('move', drawRulers);

    // Initial position & scale calculation
    applyTransform();
    drawRulers();

    // ── Drag & Drop Interactions ──────────────────────────────────────────────
    let dragActive = false;
    let startX = 0, startY = 0;
    let startPosX = 0, startPosY = 0;

    svgEl.addEventListener('pointerdown', e => {
        // If measurement mode is active, do not allow dragging the compass
        if (measureMode) return;
        
        e.preventDefault();
        svgEl.setPointerCapture(e.pointerId);
        
        dragActive = true;
        startX = e.clientX;
        startY = e.clientY;
        startPosX = posX;
        startPosY = posY;
    });

    svgEl.addEventListener('pointermove', e => {
        if (!dragActive) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        posX = startPosX + dx;
        posY = startPosY + dy;
        
        applyTransform();
    });

    const endDrag = () => {
        if (!dragActive) return;
        dragActive = false;
        
        // Update the anchor location to center pin
        anchorLatLng = map.containerPointToLatLng([posX, posY]);
        drawRulers();
    };

    svgEl.addEventListener('pointerup', endDrag);
    svgEl.addEventListener('pointercancel', endDrag);

    // ── Rotation Bezel Interaction ────────────────────────────────────────────
    let rotActive = false;
    let rotStartAngle = 0;
    let rotStartTool = 0;

    // Helper: calculate angle from compass pivot (posX, posY) to mouse point (px, py)
    function angleTo(px, py) {
        return Math.atan2(py - posY, px - posX) * 180 / Math.PI;
    }

    rotHandle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        rotHandle.setPointerCapture(e.pointerId);
        
        rotActive = true;
        rotStartAngle = angleTo(e.clientX, e.clientY);
        rotStartTool = toolRot;
    });

    rotHandle.addEventListener('pointermove', e => {
        if (!rotActive) return;
        
        e.preventDefault();
        const currentAngle = angleTo(e.clientX, e.clientY);
        const diff = currentAngle - rotStartAngle;
        
        toolRot = rotStartTool + diff;
        applyTransform();
    });

    const endRotate = () => {
        rotActive = false;
    };

    rotHandle.addEventListener('pointerup', endRotate);
    rotHandle.addEventListener('pointercancel', endRotate);

    // Double tap/click rotate handle to reset compass position to center and rotation to 0
    let lastTap = 0;
    rotHandle.addEventListener('pointerdown', () => {
        const now = Date.now();
        if (now - lastTap < 350) {
            toolRot = 0;
            posX = window.innerWidth / 2;
            posY = window.innerHeight / 2;
            applyTransform();
            drawRulers();
        }
        lastTap = now;
    });

    let isFollowingCamera = false;

    // Keep compass anchored to map on drag/zoom
    map.on('move', () => {
        if (dragActive) return; // Prevent conflicts if user is actively dragging it
        
        if (isFollowingCamera) {
            anchorLatLng = map.getCenter();
        }
        
        const point = map.latLngToContainerPoint(anchorLatLng);
        posX = point.x;
        posY = point.y;
        
        applyTransformOnly();
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
        // Recenter compass to keep it visible on screen
        const point = map.latLngToContainerPoint(anchorLatLng);
        if (point.x < 0 || point.x > window.innerWidth || point.y < 0 || point.y > window.innerHeight) {
            posX = window.innerWidth / 2;
            posY = window.innerHeight / 2;
            applyTransform();
        } else {
            posX = point.x;
            posY = point.y;
            applyTransformOnly();
        }
        drawRulers();
    });

    // ── Compass Scaling (Scroll / Pinch) ──────────────────────────────────────
    // Zoom scale with mouse wheel over the compass
    toolBox.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        currentScale = Math.max(0.4, Math.min(currentScale + delta, 2.0));
        document.documentElement.style.setProperty('--compass-scale', currentScale);
        applyTransformOnly();
    });

    // Pinch to zoom on touch devices
    let initialPinchDist = null;
    let initialScale = 1;

    toolBox.addEventListener('touchstart', e => {
        if (e.touches.length === 2) {
            dragActive = false; // Disable dragging when pinching
            e.preventDefault();
            initialPinchDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialScale = currentScale;
        }
    });

    toolBox.addEventListener('touchmove', e => {
        if (e.touches.length === 2 && initialPinchDist) {
            e.preventDefault();
            const currentDist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scaleFactor = currentDist / initialPinchDist;
            currentScale = Math.max(0.4, Math.min(initialScale * scaleFactor, 2.0));
            document.documentElement.style.setProperty('--compass-scale', currentScale);
            applyTransformOnly();
        }
    });

    toolBox.addEventListener('touchend', e => {
        if (e.touches.length < 2) {
            initialPinchDist = null;
        }
    });

    // Delay initial movement so user notices the gorgeous animation
    setTimeout(() => {
        posY += 60; 
        applyTransform();
        drawRulers();
    }, 400);

    // ── Sidebar UI Navigation ──────────────────────────────────────────────────
    const sidebar = document.getElementById('sidebar');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebarTrigger = document.getElementById('sidebar-trigger');

    if (window.matchMedia('(max-width: 768px)').matches) {
        sidebar.classList.add('collapsed');
        sidebarTrigger.classList.remove('hidden');
        document.body.classList.add('sidebar-collapsed');
    }

    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        sidebarTrigger.classList.remove('hidden');
        document.body.classList.add('sidebar-collapsed');
    });

    sidebarTrigger.addEventListener('click', () => {
        sidebar.classList.remove('collapsed');
        sidebarTrigger.classList.add('hidden');
        document.body.classList.remove('sidebar-collapsed');
    });

    // Tab switcher
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.style.display = 'none');

            tab.classList.add('active');
            const activePane = document.getElementById('tab-' + tab.dataset.tab);
            if (activePane) activePane.style.display = 'flex';
        });
    });

    // ── Map Search Location (Nominatim API) ───────────────────────────────────
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResults = document.getElementById('search-results');

    async function executeSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = '...';
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';

        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`);
            const data = await response.json();
            
            if (data && data.length > 0) {
                searchResults.style.display = 'block';
                data.forEach(item => {
                    const div = document.createElement('div');
                    div.className = 'search-result-item';
                    div.textContent = item.display_name;
                    div.addEventListener('click', () => {
                        const lat = parseFloat(item.lat);
                        const lon = parseFloat(item.lon);
                        
                        // Fly to search point
                        isFollowingCamera = true;
                        map.flyTo([lat, lon], 14);
                        
                        map.once('moveend', () => {
                            isFollowingCamera = false;
                            anchorLatLng = L.latLng(lat, lon);
                            drawRulers();
                        });
                        
                        searchResults.style.display = 'none';
                        searchInput.value = '';
                    });
                    searchResults.appendChild(div);
                });
            } else {
                searchResults.style.display = 'block';
                searchResults.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">No locations found.</div>';
            }
        } catch (error) {
            console.error("Search API Error", error);
            searchResults.style.display = 'block';
            searchResults.innerHTML = '<div style="padding: 10px; color: var(--accent-danger);">Error fetching locations.</div>';
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Go';
        }
    }

    searchBtn.addEventListener('click', executeSearch);
    searchInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') executeSearch();
    });

    // Close search dropdown when clicking outside
    document.addEventListener('click', e => {
        if (!searchResults.contains(e.target) && e.target !== searchInput && e.target !== searchBtn) {
            searchResults.style.display = 'none';
        }
    });

    // ── Theme Selector ────────────────────────────────────────────────────────
    const themeOpts = document.querySelectorAll('.theme-opt');
    const opacitySlider = document.getElementById('opacity-slider');
    const opacityVal = document.getElementById('opacity-val');
    const baseplate = document.getElementById('compass-baseplate');

    themeOpts.forEach(opt => {
        opt.addEventListener('click', () => {
            themeOpts.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            
            const theme = opt.dataset.themeVal;
            document.documentElement.setAttribute('data-theme', theme);

            // Change default map style to dark if Cyberpunk/Obsidian is chosen
            if (theme === 'cyberpunk' || theme === 'dark') {
                if (!map.hasLayer(darkMatter) && !map.hasLayer(satellite)) {
                    map.addLayer(darkMatter);
                    map.removeLayer(voyager);
                    map.removeLayer(osm);
                    map.removeLayer(topo);
                }
            } else {
                if (!map.hasLayer(osm)) {
                    map.addLayer(osm);
                    map.removeLayer(darkMatter);
                    map.removeLayer(voyager);
                    map.removeLayer(topo);
                    map.removeLayer(satellite);
                }
            }
        });
    });

    // Opacity slider
    opacitySlider.addEventListener('input', () => {
        const val = opacitySlider.value;
        opacityVal.textContent = val + '%';
        baseplate.setAttribute('fill', `rgba(180, 220, 255, ${val / 100})`);
    });

    // ── Waypoints Manager ─────────────────────────────────────────────────────
    const waypointNameInput = document.getElementById('waypoint-name-input');
    const addWaypointBtn = document.getElementById('add-waypoint-btn');
    const waypointListContainer = document.getElementById('waypoint-list-container');

    function loadWaypoints() {
        try {
            return JSON.parse(localStorage.getItem('saved_waypoints') || '[]');
        } catch (error) {
            console.warn('Unable to read saved waypoints', error);
            return [];
        }
    }

    let waypoints = loadWaypoints();

    function saveWaypoints() {
        try {
            localStorage.setItem('saved_waypoints', JSON.stringify(waypoints));
        } catch (error) {
            console.warn('Unable to save waypoints', error);
        }
        renderWaypoints();
    }

    function renderWaypoints() {
        waypointListContainer.innerHTML = '';
        
        if (waypoints.length === 0) {
            waypointListContainer.innerHTML = `
                <div class="info-row" style="justify-content: center; padding: 10px 0; color: var(--text-muted);">
                    <span>No saved waypoints yet.</span>
                </div>
            `;
            return;
        }

        waypoints.forEach((wp, index) => {
            const div = document.createElement('div');
            div.className = 'waypoint-item';
            
            div.innerHTML = `
                <div class="waypoint-details">
                    <span class="waypoint-name">${wp.name}</span>
                    <span class="waypoint-coords">${wp.lat.toFixed(5)}, ${wp.lng.toFixed(5)}</span>
                </div>
                <button class="delete-waypoint-btn" data-index="${index}" title="Delete Waypoint">
                    <i data-lucide="x" size="14"></i>
                </button>
            `;

            // Fly to waypoint on click
            div.addEventListener('click', e => {
                if (e.target.closest('.delete-waypoint-btn')) return;
                
                isFollowingCamera = true;
                map.flyTo([wp.lat, wp.lng], 14);
                
                map.once('moveend', () => {
                    isFollowingCamera = false;
                    anchorLatLng = L.latLng(wp.lat, wp.lng);
                    drawRulers();
                });
            });

            // Delete action
            div.querySelector('.delete-waypoint-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                waypoints.splice(index, 1);
                saveWaypoints();
            });

            waypointListContainer.appendChild(div);
        });
        
        createIcons();
    }

    addWaypointBtn.addEventListener('click', () => {
        const name = waypointNameInput.value.trim() || `Waypoint ${waypoints.length + 1}`;
        waypoints.push({
            name: name,
            lat: anchorLatLng.lat,
            lng: anchorLatLng.lng
        });
        waypointNameInput.value = '';
        saveWaypoints();
    });

    renderWaypoints();

    // ── Measurement Tools (Distance & Area) ──────────────────────────────
    let measureMode = null;
    let measurePts = [];
    const measureLayer = L.layerGroup().addTo(map);
    const resultEl = document.getElementById('measure-result');

    function showTransientMessage(message) {
        resultEl.textContent = message;
        resultEl.style.display = 'block';

        setTimeout(() => {
            if (!measureMode && measurePts.length === 0) {
                resultEl.style.display = 'none';
            }
        }, 3500);
    }

    const ptStyleDistance = { radius: 6, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1 };
    const ptStyleArea = { radius: 6, color: '#fff', weight: 2, fillColor: '#10b981', fillOpacity: 1 };
    const lineStyle = { color: '#2563eb', weight: 2.5, dashArray: '6,4', opacity: 0.9 };
    const polyStyle = { color: '#10b981', weight: 2.5, fillColor: '#10b981', fillOpacity: 0.15 };

    function getGeodesicDistance(a, b) {
        const R = 6371000; // Earth radius in meters
        const phi1 = a.lat * Math.PI / 180;
        const phi2 = b.lat * Math.PI / 180;
        const deltaPhi = (b.lat - a.lat) * Math.PI / 180;
        const deltaLambda = (b.lng - a.lng) * Math.PI / 180;
        
        const s = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
                  Math.cos(phi1) * Math.cos(phi2) *
                  Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
                  
        return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }

    function getSphericalArea(pts) {
        if (pts.length < 3) return 0;
        const R = 6371000;
        let area = 0;
        const n = pts.length;
        
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += (pts[j].lng - pts[i].lng) * Math.PI / 180 * 
                    (2 + Math.sin(pts[i].lat * Math.PI / 180) + Math.sin(pts[j].lat * Math.PI / 180));
        }
        return Math.abs(area * R * R / 2);
    }

    function formatDist(m) {
        return m >= 1000 ? (m / 1000).toFixed(3) + ' km' : m.toFixed(1) + ' m';
    }

    function formatArea(m2) {
        if (m2 >= 1e6) return (m2 / 1e6).toFixed(4) + ' km²';
        if (m2 >= 10000) return (m2 / 10000).toFixed(3) + ' ha';
        return m2.toFixed(1) + ' m²';
    }

    function createDivLabel(html) {
        return L.divIcon({ className: '', html, iconSize: [0, 0] });
    }

    function redrawMeasurements() {
        measureLayer.clearLayers();
        
        if (measurePts.length === 0) {
            resultEl.style.display = 'none';
            return;
        }

        const isArea = (measureMode === 'area');
        const pointStyle = isArea ? ptStyleArea : ptStyleDistance;
        const colorHex = isArea ? 'rgba(16,185,129,0.9)' : 'rgba(37,99,235,0.9)';

        // Draw node circles & numbers
        measurePts.forEach((p, i) => {
            L.circleMarker(p, pointStyle).addTo(measureLayer);
            L.marker(p, {
                icon: createDivLabel(
                    `<div style="background:rgba(0,0,0,0.75);color:#fff;padding:2px 6px;border-radius:10px;font-size:10px;font-family:var(--font-mono);border:1px solid rgba(255,255,255,0.15);transform:translate(8px,-12px);white-space:nowrap;">Point ${i + 1}</div>`
                )
            }).addTo(measureLayer);
        });

        if (isArea) {
            if (measurePts.length >= 2) {
                L.polygon(measurePts, polyStyle).addTo(measureLayer);
            }
            
            // Draw segment distances
            for (let i = 0; i < measurePts.length; i++) {
                const j = (i + 1) % measurePts.length;
                if (i === measurePts.length - 1 && measurePts.length < 3) break;
                
                const mid = L.latLng((measurePts[i].lat + measurePts[j].lat) / 2, (measurePts[i].lng + measurePts[j].lng) / 2);
                const segDist = getGeodesicDistance(measurePts[i], measurePts[j]);
                
                L.marker(mid, {
                    icon: createDivLabel(
                        `<div style="background:${colorHex};color:#fff;padding:2px 6px;border-radius:10px;font-size:9px;font-family:var(--font-mono);box-shadow:var(--shadow-sm);transform:translate(-50%,-50%);white-space:nowrap;">${formatDist(segDist)}</div>`
                    )
                }).addTo(measureLayer);
            }

            resultEl.style.display = 'block';
            if (measurePts.length < 3) {
                resultEl.innerHTML = `Area Tool &nbsp;|&nbsp; <span style="opacity: 0.7">Click at least 3 points on map</span>`;
            } else {
                const area = getSphericalArea(measurePts);
                let perimeter = 0;
                for (let i = 0; i < measurePts.length; i++) {
                    perimeter += getGeodesicDistance(measurePts[i], measurePts[(i + 1) % measurePts.length]);
                }
                resultEl.innerHTML = `Area: <strong>${formatArea(area)}</strong> &nbsp;|&nbsp; Perimeter: <strong>${formatDist(perimeter)}</strong>`;
            }
        } else {
            if (measurePts.length >= 2) {
                L.polyline(measurePts, lineStyle).addTo(measureLayer);
            }
            
            // Draw segment distances
            for (let i = 0; i < measurePts.length - 1; i++) {
                const mid = L.latLng((measurePts[i].lat + measurePts[i + 1].lat) / 2, (measurePts[i].lng + measurePts[i + 1].lng) / 2);
                const segDist = getGeodesicDistance(measurePts[i], measurePts[i + 1]);
                
                L.marker(mid, {
                    icon: createDivLabel(
                        `<div style="background:${colorHex};color:#fff;padding:2px 6px;border-radius:10px;font-size:9px;font-family:var(--font-mono);box-shadow:var(--shadow-sm);transform:translate(-50%,-50%);white-space:nowrap;">${formatDist(segDist)}</div>`
                    )
                }).addTo(measureLayer);
            }

            resultEl.style.display = 'block';
            if (measurePts.length === 1) {
                resultEl.innerHTML = `Distance Tool &nbsp;|&nbsp; <span style="opacity: 0.7">Click next point on map</span>`;
            } else {
                let totalDist = 0;
                for (let i = 0; i < measurePts.length - 1; i++) {
                    totalDist += getGeodesicDistance(measurePts[i], measurePts[i + 1]);
                }
                resultEl.innerHTML = `Total Path Distance: <strong>${formatDist(totalDist)}</strong> &nbsp;(${measurePts.length} points)`;
            }
        }
    }

    function toggleMeasureMode(mode) {
        if (measureMode === mode) {
            // Disable mode
            measureMode = null;
            document.getElementById('btn-distance').classList.remove('active');
            document.getElementById('btn-area').classList.remove('active');
            document.body.classList.remove('measuring');
            resultEl.style.display = 'none';
        } else {
            // Enable mode
            measureMode = mode;
            measurePts = [];
            document.getElementById('btn-distance').classList.toggle('active', mode === 'distance');
            document.getElementById('btn-area').classList.toggle('active', mode === 'area');
            document.body.classList.add('measuring');
            redrawMeasurements();
        }
    }

    // Map Click Listener for drawing points
    map.on('click', e => {
        if (!measureMode) return;
        measurePts.push(e.latlng);
        redrawMeasurements();
    });

    document.getElementById('btn-distance').addEventListener('click', () => toggleMeasureMode('distance'));
    document.getElementById('btn-area').addEventListener('click', () => toggleMeasureMode('area'));
    
    // Undo button
    document.getElementById('btn-undo').addEventListener('click', () => {
        if (measurePts.length > 0) {
            measurePts.pop();
            redrawMeasurements();
        }
    });

    // Clear measurements
    document.getElementById('btn-clear').addEventListener('click', () => {
        measurePts = [];
        redrawMeasurements();
    });

    // Reset compass north
    document.getElementById('btn-north').addEventListener('click', () => {
        toolRot = 0;
        applyTransform();
    });

    // Zoom to fit measurements, or reset view center
    document.getElementById('btn-fit').addEventListener('click', () => {
        if (measurePts.length > 0) {
            const bounds = L.latLngBounds(measurePts);
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            map.setView(anchorLatLng, 14);
        }
    });

    // Geolocation trigger
    document.getElementById('btn-locate').addEventListener('click', () => {
        map.locate({ setView: true, maxZoom: 16 });
    });

    map.on('locationfound', e => {
        // Place coordinates indicator and anchor there
        anchorLatLng = e.latlng;
        
        // Recenter compass to middle of screen
        posX = window.innerWidth / 2;
        posY = window.innerHeight / 2;
        
        applyTransform();
        drawRulers();
        
        // Brief location circle indicator
        const marker = L.circle(e.latlng, {
            radius: e.accuracy,
            color: 'var(--accent)',
            fillColor: 'var(--accent)',
            fillOpacity: 0.15
        }).addTo(map);
        
        setTimeout(() => map.removeLayer(marker), 6000);
    });

    map.on('locationerror', () => {
        showTransientMessage('Location access denied or unavailable.');
    });
});
