/* track.js
 *
 * TODO: - Train compositions
 *       - Train timetable information
 *       - Cleanup
 */

var trafi = 'http://rata.digitraffic.fi/api/v1/';
var meh = 'http://junat.eu/';
var vr_georss = 'http://188.117.35.14/TrainRSS/TrainService.svc/AllTrains'

// Clean this global shit up.
var map;
var compositions;
var operators;
var stations;
var trains;
var types;
var trainIcons = { 
  commuter: L.divIcon({ className: 'sjl-trains-train commuter',
                        iconSize: [ 12, 25 ] }),
  longdistance: L.divIcon({ className: 'sjl-trains-train long-distance',
                            iconSize: [ 12, 25 ] }),
};
var stationIcons = {
  generic: [ L.divIcon({ className: 'sjl-trains-station generic',
                         iconSize: [ 5, 5 ] }), -100 ],
  commuter: [ L.divIcon({ className: 'sjl-trains-station commuter',
                        iconSize: [ 5, 5 ] }), 200 ],
  person: [ L.divIcon({ className: 'sjl-trains-station person',
                      iconSize: [ 5, 5 ] }), 100 ]
};
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

function getMetas(ss, callBack) {
  var d = new Date();
  $.getJSON(trafi + '/compositions?date=' +
            d.getUTCFullYear() + "-" +
            d.getUTCMonth() + "-" +
            d.getUTCDay(),
            function(json) {
              compositions = json;
            });
  $.getJSON(trafi + '/metadata/operator',
            function(json) {
              operators = json;
            });
  $.getJSON(trafi + '/metadata/train_type',
            function(json) { types = json; });
  $.getJSON(trafi + '/metadata/station',
            function(json) {
              stations = json;
            }).done(function(json) {
              plotAllStations(ss, json)
              callBack();
            });
}

function getStationClasses(ls, ps) {
  $.getJSON(meh + '/henkiloliikenteen-asemat.json',
            function(json) {
              plotPStations(ps, json, stationIcons['person']); });
  $.getJSON(meh + '/lahiliikenteen-asemat.json',
            function(json) {
               plotCStations(ls, json, stationIcons['commuter']); });
}

function getTrains() {
  $.getJSON(trafi + '/live-trains', function(json) { trains = json; });
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
    var lat = Number(coll[i].getElementsByTagName('point')[0].
                             innerHTML.split(' ')[0]);
    var lng = Number(coll[i].getElementsByTagName('point')[0].
                             innerHTML.split(' ')[1]);
    var num = Number(coll[i].getElementsByTagName('guid')[0].
                             innerHTML.replace(/[^\d]/g, ''));

    var train = getTrainByNumber(num);
    var info;
    var label;
    var dst = getStationByUIC(train.timeTableRows[train.timeTableRows.length - 1].stationUICCode).stationName;
    var src = getStationByUIC(train.timeTableRows[0].stationUICCode).stationName;

    if (train.trainCategory == 'Commuter') {
      label = train.commuterLineID + ' (H' + train.trainNumber + ')';
      /* Commuter trains outside Helsinki region. */
      icon = trainIcons['commuter'];
    } else {
      label = train.trainType + num;
      icon = trainIcons['longdistance'];
    }
    info = label + ' ' +
           src + '-' + dst + ' ' +
           lat.toFixed(2) + '°N ' + lng.toFixed(2) + '°E'; 

    var mark = L.marker( [ lat, lng ],
                 { draggable: false,
                   clickable: true,
                   icon: icon,
                   opacity: 0.8,
                   riseOffset: 50,
                   riseOnHover: true,
                   title: info,
                   zIndexOffset: 1000 }).
                 bindLabel(label, { clickable: false,
                                    noHide: true,
                                    offset: [ 12, -22 ] });
    mark.setIconAngle(dir);

    if (train.trainCategory == 'Commuter')
      cs.push(mark);
    else
      ls.push(mark);
  }
  c.clearLayers();
  c.addLayer(L.layerGroup(cs));
  l.clearLayers();
  l.addLayer(L.layerGroup(ls));
}

function plotAllStations(group, json) {
  var ms = [];

  for(var i = 0; i < stations.length; i++) {
    var info = stations[i].stationName +
               ' (' + stations[i].stationShortCode +') ' +
               stations[i].latitude.toFixed(2) + '°N' + ', ' +
               stations[i].longitude.toFixed(2) + '°E';
    ms.push( L.marker( [ stations[i].latitude, stations[i].longitude ],
      {
        draggable: false,
        clickable: true,
        html: stations[i].stationName,
        icon: stationIcons['generic'][0],
        opacity: 0.8,
        raiseOnHover: false,
        title: info,
        zIndexOffset: stationIcons['generic'][1],
      }));
  }
  group.clearLayers();
  group.addLayer(L.layerGroup(ms));
}

function plotPStations(group, arr, icon) {
  var ms = [];

  for(var i = 0; i < arr.length - 1; i++) {
    var s = getStationByCode(arr[i]);
    var info = s.stationName +
               ' (' + s.stationShortCode +') ' +
               s.latitude.toFixed(2) + '°N' + ', ' +
               s.longitude.toFixed(2) + '°E';
    ms.push( L.marker( [ s.latitude, s.longitude ],
      {
        draggable: false,
        clickable: true,
        html: s.stationName,
        icon: icon[0],
        opacity: 0.8,
        raiseOnHover: false,
        title: info,
        zIndexOffset: icon[1]
      }));
  }
  group.clearLayers();
  group.addLayer(L.layerGroup(ms));
}

function plotCStations(group, obj, icon) {
  var ms = [];
  var ss = [];

  lahi = obj;
  jQuery.each(obj,
              function(n, o) {
                ss = ss.concat(o.filter(function(e) {
                                           return ss.indexOf(e) == -1;
                                         }));
              });

  for(var i = 0; i < ss.length - 1; i++) {
    var s = getStationByCode(ss[i]);
    var info = s.stationName +
               ' (' + s.stationShortCode +') ' +
               s.latitude.toFixed(2) + '°N' + ', ' +
               s.longitude.toFixed(2) + '°E';
    ms.push( L.marker( [ s.latitude, s.longitude ],
      {
        draggable: false,
        clickable: true,
        html: s.stationName,
        icon: icon[0],
        opacity: 0.8,
        raiseOnHover: false,
        title: info,
        zIndexOffset: icon[1]
      }));
  }
  group.clearLayers();
  group.addLayer(L.layerGroup(ms));
}

$().ready(function() {
  var osmBW = new L.TileLayer(
    'http://a.www.toolserver.org/tiles/bw-mapnik/{z}/{x}/{y}.png',
    { attribution:
        '<a href="https://github.com/samilaine/junat.eu">Junat Kartalla</a>' +
        ' &copy; <a href="http://github.com/samilaine">' +
        'Sami Laine</a> | ' +
        'Map data © <a href="http://openstreetmap.org">' +
        'OpenStreetMap</a> contributors' } );   

  var ls = new L.layerGroup();
  var ps = new L.layerGroup();
  var ss = new L.layerGroup();
  var lts = new L.layerGroup();
  var cts = new L.layerGroup();

  map = L.map('sjl-trains-map', { center: [ 60.860, 24.994 ],
                       layers: [ osmBW, ps, lts, cts ],
                        zoom: 7 });

  L.control.layers({
                   },
                   { 
                     'Henkilöliikenteen asemat': ps,
                     'Kaikki liikennepaikat': ss,
                     'Lähiliikenteen asemat': ls,
                     'Kaukojunat': lts,
                     'Lähijunat': cts,
                   }).addTo(map);

  if (L.Browser.touch)
    L.control.touchHover().addTo(map);

  getTrains();
  getMetas(ss, function() { getStationClasses(ls, ps); });

  timers.push(setInterval(function() {
                            getMetas(ls, ps, ss, function() {});
                          }, 1000 * 60 * 15));
  timers.push(setInterval(function() { getTrains(); }, 1000 * 120));
  timers.push(setInterval(function() { getVR(lts, cts); }, 1000 * 5));
});

// end of file.
