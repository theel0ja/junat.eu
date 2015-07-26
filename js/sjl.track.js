/* track.js
 *
 * TODO: - Train compositions
 *       - Train timetable information
 *       - Cleanup
 */

var api = 'http://rata.digitraffic.fi/api/v1/';
var vr_georss = 'http://188.117.35.14/TrainRSS/TrainService.svc/AllTrains'

// Clean this global shit up.
var map;
var compositions;
var operators;
var stations;
var trains;
var types;
var icons = { train: L.divIcon({ className: 'sjl-trains-train',
                                 iconSize: [ 12, 25 ] }),
              station: L.divIcon({ className: 'sjl-trains-station',
                                   iconSize: [ 5, 5 ] }) };
var timers = [];

function getPrevStation(train) {
  var s = undefined;

  if (train.timeTableRows) {
    s = jQuery.grep(train.timeTableRows,
                        function(e, i) {
                           return typeof(e.actualTime) != 'undefined' &&
                           e.type == 'DEPARTURE'; }).slice(-1)[0];
    if (!s)
      s = train.timeTableRows.slice[0];
  }

  return s;
}

function getNextStation(train) {
  var s = undefined;

  if (train.timeTableRows) {
    s = jQuery.grep(train.timeTableRows,
                    function(e, i) {
                      return typeof(e.liveEstimateTime) != 'undefined' &&
                             e.type == 'ARRIVAL';})[0];
    if (!s)
      s = train.timeTableRows.slice(-1)[0];
  }

  return s;
}

function getStationLocByUIC(id) {
  var s = jQuery.grep(stations,
                      function(e, i) { return e.stationUICCode == id; });
  return [ s.latitude, s.longitude ];
}

function getTrainByNumber(id) {
  return jQuery.grep(trains,
    function(e, i) { return e.trainNumber == id; })[0];
}

function getStationByUIC(id) {
  return jQuery.grep(stations,
    function(e, i) { return e.stationUICCode == id; })[0];
}

function getStationByCode(id) {
  if (stations)
    return jQuery.grep(stations,
                      function(e, i) { return e.stationShortCode == id; })[0];
  return undefined;
}

function getStationByName(id) {
  return jQuery.grep(stations,
    function(e, i) { return e.stationName == id; })[0];
}

function getTrafiMetas(ss) {
  var d = new Date();
  var i = 1;
  setTimeout(function() {
               $.getJSON(api + '/compositions?date=' +
                         d.getUTCFullYear() + "-" +
                         d.getUTCMonth() + "-" +
                         d.getUTCDay(),
                         function(json) { compositions = json; }); }, 200);
  setTimeout(function() {
               $.getJSON(api + '/metadata/operator',
               function(json) { operators = json; }); }, 200 * i++);
  setTimeout(function() {
               $.getJSON(api + '/metadata/station',
               function(json) { stations = json;
                                plotStations(ss, json); }); }, 200 * i++);
  setTimeout(function() {
               $.getJSON(api + '/metadata/train_type',
               function(json) { types = json; }); }, 200 * i++);
}

function getTrains() {
  $.getJSON(api + '/live-trains', function(json) { trains = json; });
}

function getVR(l, c) {
  /* 
   * Use Yahoo API to get past cross-domain query restrictions.
   * Usable for some tiny, small crap like VR live RSS.
   */
  $.getJSON("http://query.yahooapis.com/v1/public/yql?"+
            "q=select%20*%20from%20html%20where%20url%3D%22"+
             encodeURIComponent(vr_georss)+
             "%22&format=xml'&callback=?",
             function(data) {
               if ( data.results[0] )
                 updateVR(l, c, data.results[0]); });
}

function updateVR(l, c, rss) {
  var coll = $.parseXML(rss.replace(/title/g, 'nom')).
               getElementsByTagName('item');
  var cs = [];
  var ls = [];

  for(var i = coll.length - 1; i > 0; i--) {
    var dir = coll[i].getElementsByTagName('dir')[0].innerHTML;
    var dst = coll[i].getElementsByTagName('to')[0].innerHTML;
    var num = Number(coll[i].getElementsByTagName('guid')[0].
                             innerHTML.replace(/[^\d]/g, ''));
    var lat = Number(coll[i].getElementsByTagName('point')[0].
                             innerHTML.split(' ')[0]);
    var lng = Number(coll[i].getElementsByTagName('point')[0].
                             innerHTML.split(' ')[1]);
    var src = coll[i].getElementsByTagName('from')[0].innerHTML;
    var typ = coll[i].getElementsByTagName('cat')[0].innerHTML;
    var to = getStationByCode(dst);
    var fr = getStationByCode(src);
    var info;

    var label;
    var trainInfo = getTrainByNumber(num);

    if (typ == 'H') {
      label = getTrainByNumber(num).commuterLineID;
      console.log('typeof(' + label + '): ' + typeof(label) );
      /* Commuter trains outside Helsinki region. */
      if (typeof(label) == 'undefined')
        label = typ + num;
      info = label + ' ' +
             fr.stationName + '-' + to.stationName + ' ' +
             lat.toFixed(2) + '°N ' + lng.toFixed(2) + '°E'; 
    } else {
      label = typ + num;
      info =  typ + num + ' ' +
              fr.stationName + '-' + to.stationName + ' ' +
              lat.toFixed(2) + '°N ' + lng.toFixed(2) + '°E'; 
    }

    var mark = L.marker( [ lat, lng ],
                 { draggable: false,
                   clickable: true,
                   icon: icons['train'],
                   opacity: 0.8,
                   riseOffset: 50,
                   riseOnHover: true,
                   title: info,
                   zIndexOffset: 1000 }).
                 bindLabel(label, { clickable: false,
                                    noHide: true,
                                    offset: [ 12, -22 ] });
    mark.setIconAngle(dir);

    if (typ == 'H')
      cs.push(mark);
    else
      ls.push(mark);
  }
  c.clearLayers();
  c.addLayer(L.layerGroup(cs));
  l.clearLayers();
  l.addLayer(L.layerGroup(ls));
}

function plotStations(ss, json) {
  var ms = [];

  for(var i = 0; i < stations.length; i++) {
    var info = stations[i].stationName +
               ' (' + stations[i].stationShortCode +') ' +
               stations[i].latitude.toFixed(2) + '°N' + ', ' +
               stations[i].longitude.toFixed(2) + '°E';
    ms.push( L.marker( [ stations[i].latitude, stations[i].longitude ],
      { draggable: false,
        clickable: true,
        html: stations[i].stationName,
        icon: icons['station'],
        opacity: 0.8,
        raiseOnHover: false,
        title: info }));
  }
  ss.clearLayers();
  ss.addLayer(L.layerGroup(ms));
}

$().ready(function() {
  var osmBW = new L.TileLayer(
    'http://a.www.toolserver.org/tiles/bw-mapnik/{z}/{x}/{y}.png',
    { attribution:
        '<a href="https://github.com/samilaine/junat.eu">Junat Kartalla</a>' +
        ' &copy; <a href="http://github.com/samilaine">' +
        'Sami Laine</a> ' +
        'Map data © <a href="http://openstreetmap.org">' +
        'OpenStreetMap</a> contributors' } );   

  var ss = new L.layerGroup();
  var lts = new L.layerGroup();
  var cts = new L.layerGroup();

  map = L.map('map', { center: [ 61.360, 24.994 ],
                       layers: [ osmBW, ss, lts, cts ],
                        zoom: 7 });

  L.control.layers(null, { 
                           'Kaukojunat': lts,
                           'Liikennepaikat': ss,
                           'Lähijunat': cts,
                   }).addTo(map);

  if (L.Browser.touch)
    L.control.touchHover().addTo(map);

  getTrains();
  getTrafiMetas(ss);

  timers.push(setInterval(function() {
                            getTrafiMetas(ss); }, 1000 * 60 * 15));
  timers.push(setInterval(function() { getTrains(); }, 1000 * 120));
  timers.push(setInterval(function() { getVR(lts, cts); }, 1000 * 5));
});

// end of file.
