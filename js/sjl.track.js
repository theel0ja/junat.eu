/* track.js
 *
 * TODO: - Train compositions
 *       - Train timetable information
 *       - Cleanup
 */

var trafi = 'http://rata.digitraffic.fi/api/v1/';
var vr_georss = 'http://188.117.35.14/TrainRSS/TrainService.svc/AllTrains'

// Clean this global shit up.
var map;
var stationLayers = [ L.layerGroup(), L.layerGroup(), L.layerGroup() ];
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

function getMetas() {
  var d = new Date();

  $.getJSON(trafi + '/metadata/station',
            function(json) {
              stations = json;
              plotAllStations(stations);
              plotPStations(PStations, stationIcons['person']);
              plotCStations(CStations, stationIcons['commuter']);
            }).
    then(function() {
           $.getJSON(trafi + '/compositions?date=' +
                     d.getUTCFullYear() + "-" +
                     d.getUTCMonth() + "-" +
                     d.getUTCDay(),
                     function(json) { compositions = json; }) }).
    then(function() {
           $.getJSON(trafi + '/metadata/operator',
                     function(json) { operators = json; }) }).
    then(function() {
           $.getJSON(trafi + '/metadata/train_type',
                     function(json) { types = json; }) });
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

function trainInfo(id, lat, lng) {
  var departure, arrival, infoContent, tmp;
  var group = new L.LayerGroup();
  var i;
  var label;
  var line;
  var path = [];
  var pathUICs = [];
  var station;
  var train = getTrainByNumber(id);
  var type;

  if (typeof(train) == 'undefined') return;

  train.timeTableRows.unique().forEach(function(c, i, a) {
                                         pathUICs.push(c.stationUICCode); });
  pathUICs.forEach(function(c, i, a) {
                     station =  getStationByUIC(c);
                     path.push([ station.latitude, station.longitude ]);
                   });

  line = L.polyline(path, { clickable: false,
                            color: '#FF8080',
                            smoothFactor: 3.0 });

  if (train.trainCategory == 'Commuter')
    type = train.commuterLineID;
  else
    type = train.trainType + ' ' + train.trainNumber;

  tmp = train.timeTableRows[train.timeTableRows.length - 1];
  if (typeof(tmp.liveEstimateTime) == 'undefined')
    arrival = tmp.scheduledTime;
  else
    arrival = tmp.liveEstimateTime;

  tmp = train.timeTableRows[0];
  if (typeof(tmp.actualTime) == 'undefined')
    departure = tmp.scheduledTime;
  else
    departure = tmp.actualTime;

  group.addLayer(line);
  map.addLayer(group);

  map.once('click', function() { map.removeLayer(group); });
  setTimeout(function() { map.removeLayer(group); }, 1000 * 15);
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
    var dst = getStationByUIC(train.timeTableRows[train.timeTableRows.length - 1].stationUICCode).stationName.replace(/ asema/, '');
    var src = getStationByUIC(train.timeTableRows[0].stationUICCode).stationName.replace(/ asema/, '');

    if (train.trainCategory == 'Commuter') {
      label = train.commuterLineID;
      /* Commuter trains outside Helsinki region. */
      icon = trainIcons['commuter'];
    } else {
      if (train.trainType.charAt(0) == 'H')
        label = 'H' + num;
      else
        label = train.trainType + num;
      icon = trainIcons['longdistance'];
    }
    info = num + ' ' + src + '-' + dst + ' ' +
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
    mark.addEventListener('click', trainInfo.bind(this, num, lat, lng), false);
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

function plotAllStations(json) {
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
  stationLayers[0].clearLayers();
  stationLayers[0].addLayer(L.layerGroup(ms));
}

var PStations = [ "AIN", "ALV", "DRA", "ENO", "EPO", "EPZ",
  "HAA", "HAU", "HK", "HKH", "HKI", "HKP", "HKS", "HL", "HNK",
  "HNV", "HP", "HPJ", "HPK", "HPL", "HR", "HVA", "HÖL", "IKO",
  "IKR", "IKY", "ILA", "ILM", "IMR", "ITA", "JJ", "JK", "JNS",
  "JP", "JR", "JRS", "JTS", "JY", "JÄS", "KA", "KAJ", "KAN",
  "KE", "KEA", "KEM", "KEU", "KHA", "KIL", "KIT", "KIÄ", "KJÄ",
  "KKI", "KKN", "KLH", "KLI", "KLN", "KLO", "KNI", "KNS", "KOH",
  "KOK", "KON", "KON", "KR", "KRA", "KRS", "KRU", "KRV", "KTA",
  "KTI", "KTS", "KUO", "KUT", "KV", "KVH", "KVY", "KY", "KYN",
  "KÄP", "LAA", "LAI", "LH", "LIS", "LM", "LMA", "LNA", "LOH",
  "LPA", "LPO", "LPV", "LPÄ", "LR", "LUS", "LVT", "MAS", "MH",
  "MI", "MIS", "MKI", "ML", "MLA", "MLO", "MLÄ", "MNK", "MR",
  "MRL", "MUL", "MY", "MYR", "MÄK", "NOA", "NRM", "NSL", "NUP",
  "NVL", "OI", "OL", "OLK", "OU", "OVK", "PAR", "PEL", "PH",
  "PHÄ", "PJM", "PKO", "PKY", "PLA", "PM", "PMK", "PNÄ", "POH",
  "PRI", "PRL", "PSL", "PTI", "PTO", "PUN", "PUR", "PVI", "REE",
  "RI", "RKI", "RKL", "RNN", "ROI", "RY", "SAU", "SAV", "SGY",
  "SIJ", "SK", "SKV", "SL", "SLO", "SNJ", "SPL", "STI", "TK",
  "TKL", "TKU", "TL", "TMS", "TNA", "TOL", "TPE", "TRI", "TRL",
  "TRV", "TSL", "TU", "TUS", "TUU", "UIM", "UTJ", "VAA", "VAR",
  "VIA", "VIH", "VKS", "VLP", "VMA", "VMO", "VNA", "VNJ", "VS",
  "VSL", "VTI", "YST", "YTR", "YV", "ÄHT" ];

function plotPStations(arr, icon) {
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
  stationLayers[1].clearLayers();
  stationLayers[1].addLayer(L.layerGroup(ms));
}

// l = getTrainByNumber(8747).timeTableRows; r = []; for(var i = l.length - 1; i > 0; i--) { r.push(l[i].stationShortCode); } copy(Array.sort(r));
var CStations =
{
  "aTrainStations": [ "HKI", "HPL", "ILA", "KHK", "MÄK", "PJM", "PSL", "VMO" ],
  "eTrainStations": [ "EPO", "HPL", "KEA", "KIL", "KLH", "KNI", "KVH", "LPV",
    "PSL", "TRL" ],
  "hTrainStations": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA", "KAN",
    "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO", "MRL",
    "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL", "TNA", "VEH",
    "VKS", "VMS" ],
  "iTrainStations": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA",
    "KAN", "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO",
    "MRL", "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL", "TNA",
    "VEH", "VKS", "VMS" ],
  "kTrainStations": [ "HKH", "HNA", "HVK", "KE", "KRS", "KVY", "ML", "OLK",
    "PLA", "PSL", "RKL", "SAV", "TKL" ],
  "lTrainStations": [ "EPO", "HEK", "HKI", "HPL", "JRS", "KEA", "KHK", "KIL",
    "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "PSL", "TOL", "TRL",
    "VKH" ],
  "nTrainStations": [ "HKH", "HNA", "HVK", "KE", "KRS", "KVY", "KÄP", "ML",
    "OLK", "PLA", "PMK", "PSL", "RKL", "SAV", "TKL", "TNA" ],
  "pTrainStations": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA",
    "KAN", "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO",
    "MRL", "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL",
    "TNA", "VEH", "VKS", "VMS" ],
  "rTrainStations": [ "AIN", "ARP", "HKH", "HKI", "HNA", "HVK", "HY", "JK",
    "JP", "KE", "KRS", "KVY", "KYT", "KÄP", "ML", "NUP", "OLK", "PLA", "PLP",
    "PMK", "PSL", "PUR", "RKL", "SAU", "SAV", "TKL", "TNA" ],
  "sTrainStations": [ "EPO", "HEK", "HPL", "ILA", "JRS", "KEA", "KHK",
    "KIL", "KKN", "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "MÄK",
    "PJM", "PSL", "TOL", "TRL", "VKH", "VMO" ],
  "tTrainStations": [],
  "uTrainStations": [ "EPO", "HEK", "HKI", "HPL", "ILA", "JRS", "KEA",
    "KHK", "KIL", "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "MÄK",
    "PJM", "PSL", "TOL", "TRL", "VKH", "VMO" ],
  "yTrainStations": [ "KR", "IKO", "STI", "KKN", "MAS", "LPV", "HKI" ],
  "zTrainStations": [ "HAA", "HKH", "HLT", "HNA", "HVK", "KE", "KRS",
    "KSU", "KVY", "KYT", "KÄP", "LH", "LÄH", "ML", "MLÄ", "OLK", "PLA",
    "PMK", "PSL", "RKL", "SAV", "SIP", "TKL", "TNA" ]
}; 

function plotCStations(obj, icon) {
  var ms = [];
  var ss = [];

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
  stationLayers[2].clearLayers();
  stationLayers[2].addLayer(L.layerGroup(ms));
}

$().ready(function() {
  var osmBW = new L.TileLayer(
    'http://a.www.toolserver.org/tiles/bw-mapnik/{z}/{x}/{y}.png',
    { attribution:
        '<a href="https://github.com/samilaine/junat.eu">Sorsat</a>' +
        ' | ' +
        'Map data © <a href="http://openstreetmap.org">' +
        'OpenStreetMap</a> contributors' } );   

  var ls = new L.layerGroup();
  var ps = new L.layerGroup();
  var ss = new L.layerGroup();
  var lts = new L.layerGroup();
  var cts = new L.layerGroup();
  var paths = new L.layerGroup();

  map = L.map('sjl-trains-map', { center: [ 60.860, 24.994 ],
                                  layers: [ cts, lts, paths, osmBW,
                                            stationLayers[1] ],
                                  zoom: 7 });

  L.control.layers({ },
                   { 
                     'Henkilöliikenteen asemat': stationLayers[2],
                     'Kaikki liikennepaikat': stationLayers[0],
                     'Lähiliikenteen asemat': stationLayers[1],
                     'Kaukojunat': lts,
                     'Lähijunat': cts,
                   }).addTo(map);

  if (L.Browser.touch)
    L.control.touchHover().addTo(map);

  getTrains();
  getMetas();

  timers.push(setInterval(function() {
                            getMetas(ls, ps, ss, function() {});
                          }, 1000 * 60 * 15));
  timers.push(setInterval(function() { getTrains(); }, 1000 * 120));
  timers.push(setInterval(function() { getVR(lts, cts, paths); }, 1000 * 5));
});

// end of file.
