/* track.js
 *
 * TODO: - Train compositions
 *       - Train timetable information
 *       - Cleanup
 */

var trafi = 'http://rata.digitraffic.fi/api/v1/';
var vr_georss = 'http://188.117.35.14/TrainRSS/TrainService.svc/AllTrains'

/* 
 * Map layers.
 * 0 = all stations
 * 1 = commercial person traffic stations
 * 2 = commuter stations
 * 3 = train info display and train path
 * 4 = station info display
 * 5 = long distance trains
 * 6 = commuter trains
 */
var layers = Array(7);
var stationInfoTimer;

// Clean this global shit up.
var tracked;
var map;
var compositions;
var operators;
var stations;
var trains;
var types;
var trainIcons = { 
  commuter: L.divIcon({ className: 'sjl-trains-train hsl',
                        iconSize: [ 12, 25 ] }),
  longdistance: L.divIcon({ className: 'sjl-trains-train vr',
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

function getVR() {
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
                 updateVR(data.results[0]); });
}

function infoPath(id) {
  var line, lineClass;
  var path = [];
  var pathUICs = [];
  var train = getTrainByNumber(id);

  if (typeof(train) == 'undefined') return;

  train.timeTableRows.unique().forEach(function(c, i, a) {
                                         pathUICs.push(c.stationUICCode); });
  pathUICs.forEach(function(c, i, a) {
                     station =  getStationByUIC(c);
                     path.push([ station.latitude, station.longitude ]);
                   });

  if (train.trainCategory == 'Commuter')
    lineClass = 'hsl';
  else
    lineClass = 'vr';

  line = L.polyline(path, { clickable: false,
                            color: '#FF8080',
                            smoothFactor: 2.0,
                            opacity: 0.3 });

  layers[3].clearLayers();
  layers[3].addLayer(line);
}

function updateVR(rss) {
  var coll = $.parseXML(rss.replace(/title/g, 'nom')).
               getElementsByTagName('item');
  var cs = [];
  var ls = [];
  var trk = 0;

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
                   zIndexOffset: 1000 }).
                 bindLabel(label, { clickable: false,
                                    noHide: true,
                                    offset: [ 12, -22 ] });
    mark.setIconAngle(dir);

    if (train.trainCategory == 'Commuter') {
      mark.on('click', infoTrain.bind(this, 'hsl', lat, lng, num))
      cs.push(mark);
    } else {
      mark.on('click', infoTrain.bind(this, 'vr', lat, lng, num))
      ls.push(mark);
    }

    if (num == tracked) { trk = tracked; }
  }

  if (trk == 0) 
    infoTrainHide();
  else
    infoUpdate(lat, lng, tracked);

  layers[5].clearLayers();
  layers[5].addLayer(L.layerGroup(ls));
  layers[6].clearLayers();
  layers[6].addLayer(L.layerGroup(cs));
}

function plotAllStations(json) {
  var ms = [];

  for(var i = 0; i < stations.length; i++) {
    var s = stations[i];
    var info = s.stationName +
               ' (' + s.stationShortCode +') ' +
               s.latitude.toFixed(2) + '°N' + ', ' +
               s.longitude.toFixed(2) + '°E';
    var mark = L.marker( [ s.latitude, s.longitude ],
      {
        draggable: false,
        clickable: true,
        html: s.stationName,
        icon: stationIcons['generic'][0],
        opacity: 0.8,
        raiseOnHover: false,
        title: info,
        zIndexOffset: stationIcons['generic'][1],
      });
    mark.on('click', (function(uic) {
          infoStation(uic); }).bind(this,s.stationUICCode));
    ms.push(mark);
  }
  layers[0].clearLayers();
  layers[0].addLayer(L.layerGroup(ms));
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
    var mark = L.marker( [ s.latitude, s.longitude ],
      {
        draggable: false,
        clickable: true,
        html: s.stationName,
        icon: icon[0],
        opacity: 0.8,
        raiseOnHover: false,
        zIndexOffset: icon[1]
      });
    mark.on('click', (function(uic) {
          infoStation(uic); }).bind(this,s.stationUICCode));
    ms.push(mark);
  }
  layers[1].clearLayers();
  layers[1].addLayer(L.layerGroup(ms));
}

var CStations =
{
  "A": [ "HKI", "HPL", "ILA", "KHK", "MÄK", "PJM", "PSL", "VMO" ],
  "E": [ "EPO", "HPL", "KEA", "KIL", "KLH", "KNI", "KVH", "LPV",
    "PSL", "TRL" ],
  "H": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA", "KAN",
    "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO", "MRL",
    "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL", "TNA", "VEH",
    "VKS", "VMS" ],
  "I": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA",
    "KAN", "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO",
    "MRL", "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL", "TNA",
    "VEH", "VKS", "VMS" ],
  "K": [ "HKH", "HNA", "HVK", "KE", "KRS", "KVY", "ML", "OLK",
    "PLA", "PSL", "RKL", "SAV", "TKL" ],
  "L": [ "EPO", "HEK", "HKI", "HPL", "JRS", "KEA", "KHK", "KIL",
    "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "PSL", "TOL", "TRL",
    "VKH" ],
  "N": [ "HKH", "HNA", "HVK", "KE", "KRS", "KVY", "KÄP", "ML",
    "OLK", "PLA", "PMK", "PSL", "RKL", "SAV", "TKL", "TNA" ],
  "P": [ "ASO", "AVP", "HKH", "HKI", "HPL", "HVK", "ILA",
    "KAN", "KHK", "KTÖ", "KÄP", "LAV", "LEN", "LNÄ", "LOH", "ML", "MLO",
    "MRL", "MYR", "OLK", "PLA", "PMK", "POH", "PSL", "RSM", "TKL",
    "TNA", "VEH", "VKS", "VMS" ],
  "R": [ "AIN", "ARP", "HKH", "HKI", "HNA", "HVK", "HY", "JK",
    "JP", "KE", "KRS", "KVY", "KYT", "KÄP", "ML", "NUP", "OLK", "PLA", "PLP",
    "PMK", "PSL", "PUR", "RKL", "SAU", "SAV", "TKL", "TNA" ],
  "S": [ "EPO", "HEK", "HPL", "ILA", "JRS", "KEA", "KHK",
    "KIL", "KKN", "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "MÄK",
    "PJM", "PSL", "TOL", "TRL", "VKH", "VMO" ],
  "T": [],
  "U": [ "EPO", "HEK", "HKI", "HPL", "ILA", "JRS", "KEA",
    "KHK", "KIL", "KLH", "KNI", "KVH", "LMA", "LPV", "MAS", "MNK", "MÄK",
    "PJM", "PSL", "TOL", "TRL", "VKH", "VMO" ],
  "Y": [ "KR", "IKO", "STI", "KKN", "MAS", "LPV", "HKI" ],
  "Z": [ "HAA", "HKH", "HLT", "HNA", "HVK", "KE", "KRS",
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
    mark = L.marker( [ s.latitude, s.longitude ],
      {
        draggable: false,
        clickable: true,
        html: s.stationName,
        icon: icon[0],
        opacity: 0.8,
        raiseOnHover: false,
        title: info,
        zIndexOffset: icon[1]
      });
    mark.on('click', (function(uic) {
          infoStation(uic); }).bind(this,s.stationUICCode));
    ms.push(mark);
  }
  layers[2].clearLayers();
  layers[2].addLayer(L.layerGroup(ms));
}

function zPad(i, n) {
  return (Array(i).join("0") + n).slice(0 - i);
}

function infoUpdate(lat, lng, num) {
  var head, loc, endpoints, times, train;
  var tmp;

  if ( typeof(getTrainByNumber(num)) == 'undefined') return;

  info = $('#train-info').first();
  endpoints = getStationByUIC(getTrainByNumber(num).
                               timeTableRows.first().stationUICCode).
                stationName.replace(/ asema/, '') + '<br>' +
              getStationByUIC(getTrainByNumber(num).
                               timeTableRows.last().stationUICCode).
                stationName.replace(/ asema/, '');
  train = getTrainByNumber(num);
  if (train.trainCategory == 'Commuter') {
    $('#train-info').first().addClass('hsl');
    head = train.commuterLineID + ' (' + train.trainNumber + ')';
  } else {
    $('#train-info').first().addClass('vr');
    if (train.trainType.charAt(0) == 'H')
      head = 'H' + train.trainNumber;
    else
      head = train.trainType + train.trainNumber;
  }
  head += '<br>' + endpoints;

  $('#train-info-head').first().html(head);
  $('#train-info-loc').first().html(lat + '°N<br>' + lng + '°E');
  if ( typeof(train.timeTableRows.first().actualTime) == 'undefined' )
    tmp = new Date(train.timeTableRows.first().scheduledTime);
  else
    tmp = new Date(train.timeTableRows.first().actualTime);
  times = 'Lähtöaika: ' + zPad(2, tmp.getHours()) + ':' +
                          zPad(2, tmp.getMinutes()) + '<br>'

  if ( typeof(train.timeTableRows.last().actualTime) == 'undefined' )
    tmp = new Date(train.timeTableRows.last().scheduledTime);
  else
    tmp = new Date(train.timeTableRows.last().actualTime);
  times += 'Saapumisaika: ' + zPad(2, tmp.getHours()) + ':' +
                              zPad(2, tmp.getMinutes()) + '<br>'

  $('#train-info-times').first().html(times);
  $('#train-info-loc').first().html(lat.toFixed(2) + '°N<br>' +
                              lng.toFixed(2) + '°E');
}

function infoStationHide() {
  layers[4].clearLayers();
  $('#station-info').first().fadeOut();
  $('#station-info').first().removeClass('station-info');
  clearTimeout(stationInfoTimer);
}

function infoStation(uic) {
  var station = getStationByUIC(uic);

  if ( typeof(station) == 'undefined' ) return;
  clearTimeout(stationInfoTimer);

  $('#station-info-head').first().text(station.stationName);
  $('#station-info-times').first().text(station.stationShortCode);
  $('#station-info-loc').first().text(station.latitude.toFixed(2) + '°N ' +
                                      station.longitude.toFixed(2) + '°E');
  $('#station-info').first().addClass('station-info');
  $('#station-info').first().fadeIn();
  $('#station-info').one('click', function() { infoStationHide(); });
  stationInfoTimer = setTimeout(function() { infoStationHide(); }, 1000 * 7);
}

function infoTrainHide() {
  tracked = undefined;
  layers[3].clearLayers();
  $('#train-info').first().fadeOut();
  $('#train-info').first().removeClass('vr').removeClass('hsl');
}

function infoTrain(color, lat, lng, num) {
  tracked = num;
  infoPath(num);
  $('#train-info').first().removeClass('vr').removeClass('hsl');
  infoUpdate(lat, lng, num);
  $('#train-info').first().fadeIn();
  $('#train-info').one('click', function() { infoTrainHide(); });
}

$().ready(function() {
  for(var i = 0; i < layers.length; i++) layers[i] = L.layerGroup();

  var osmBW = new L.TileLayer(
    'http://a.www.toolserver.org/tiles/bw-mapnik/{z}/{x}/{y}.png',
    { attribution:
        '<a href="https://github.com/samilaine/junat.eu">Sorsat</a>' +
        ' | ' +
        'Map data © <a href="http://openstreetmap.org">' +
        'OpenStreetMap</a> contributors' } );   

  map = L.map('sjl-trains-map', { center: [ 60.860, 24.9327 ],
//  map = L.map('sjl-trains-map', { center: [ 60.17, 24.9327 ],
                                  zoomControl: false,
                                  layers: [ osmBW,
                                            layers[1], layers[3],
                                            layers[4], layers[5],
                                            layers[6] ],
//                                  zoom: 13 });
                                  zoom: 7 });
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.control.layers({ },
                   { 
                     'Henkilöliikenteen asemat': layers[1],
                     'Kaikki liikennepaikat': layers[0],
                     'Lähiliikenteen asemat': layers[2],
                     'Kaukojunat': layers[5],
                     'Lähijunat': layers[6],
                   }).addTo(map);

  if (L.Browser.touch)
    L.control.touchHover().addTo(map);

  getTrains();
  getMetas();

  timers.push(setInterval(function() { getMetas(); }, 1000 * 60 * 15));
  timers.push(setInterval(function() { getTrains(); }, 1000 * 120));
  timers.push(setInterval(function() { getVR(); }, 1000 * 5));
});

// end of file.
