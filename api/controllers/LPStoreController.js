var LPStoreController = {

  updateItems: function (req, res){
    var moment = require('moment');
    Item.find().done(function (err, items){
      if (err) res.serverError(err); else if (items) {
        for (var item in items) {
          if (items.hasOwnProperty(item)) {
            item = items[item];
            if (moment(item.updatedAt).add(3, 'hours').isBefore(moment())) { // FIXME waterline bug, fixed in 0.10
              LPStoreController.evecentralRead(req, res, item.itemID)
            }
          }
        }
      }
    });
    res.send({action: 'LPStore:updateItems', result: 'started'})
  },

  updateRequirements: function (req, res) {
    LPStore.find().done(function (err, offers){ if (err) res.serverError(err); else if (offers) {
      for (var offerPosition in offers) { if (offers.hasOwnProperty(offerPosition)) { var offer = offers[offerPosition];
        LPStore.update({
          itemID: offer.itemID
        }, {
          requirementsPrice: 0
        }).done((function(offer){return function (err){ if (err) res.serverError(err); else {
          var requirementsPrice = 0, requirementsPrices = [];

          function getRequirementPrice(item, cb) {
            Item.findOneByItemID(item.itemID).done(function (err, itemInItem){ if (err) res.serverError(err); else if (itemInItem)
              requirementsPrice += itemInItem.sellMin * item.itemAmount;
              requirementsPrices.push(itemInItem.sellMin);
              cb()
            })
          }

          function setRequirementPrice(offer) {
            LPStore.update({
              hash: offer.hash
            },{
              requirementsPrice: requirementsPrice
            }).done(function (err){ if (err) res.serverError(err); else sails.log.info('Offer ' + offer.itemID + ' updated requirements!') })
          }

          if (offer.requirements != null) {
            offer.requirements.forEach(function(item){
              getRequirementPrice(item, function(){
                if (requirementsPrices.length == offer.requirements.length) {
                  setRequirementPrice(offer)
                }
              })
            })
          } else setRequirementPrice(offer)

        }}}(offer)))
      }}
    }});
    res.send({action: 'LPStore:updateRequirements', result: 'started'})
  },

  updateProfit: function (req, res) {
    LPStore.find().done(function (err, offers){ if (err) res.serverError(err); else if (offers) {
      for (var offerPosition in offers) { if (offers.hasOwnProperty(offerPosition)) { var offer = offers[offerPosition];
        LPStore.update({
          itemID: offer.itemID
        }, {
          profitISK: 0,
          profitISKPerLP: 0
        }).done((function(offer){return function (err){ if (err) res.serverError(err); else {
          Item.findOneByItemID(offer.itemID).done(function (err, itemInItem){ if (err) res.serverError(err); else {
            var
              profitISK = itemInItem.buyMax * offer.itemAmount - (offer.priceISK + offer.requirementsPrice),
              profitISKPerLP = profitISK / offer.priceLP;
            LPStore.update({
              hash: offer.hash
            },{
              profitISK: profitISK,
              profirISKPerLP: profitISKPerLP
            }).done(function (err){ if (err) res.serverError(err); else sails.log.info('Offer ' + offer.itemID + ' updated profit!') })
          }})
        }}}(offer)))
      }}
    }});
    res.send({action: 'LPStore:updateProfit', result: 'started'})
  },

  checkItem: function (req, res, itemID) {
    Item.findOneByItemID(itemID).done(function (err, item){
      if (err) res.serverError(err); else if (!item) {
        Item.create({
          itemID: itemID
        }).done(function (err) {
          if (err) res.serverError(err); else {
            sails.log.info('Item ' + itemID + ' created!');
          }
        })
      }
    });
  },

  evecentralRead: function (req, res, itemID) {
    var
      http = require('http'),
      xml2js = require('xml2js');
    http.get({
      host: 'api.eve-central.com',
      path: '/api/marketstat?regionlimit=10000001&regionlimit=10000002&regionlimit=10000013&regionlimit=10000016&regionlimit=10000020&regionlimit=10000028&regionlimit=10000030&regionlimit=10000032&regionlimit=10000033&regionlimit=10000036&regionlimit=10000037&regionlimit=10000038&regionlimit=10000042&regionlimit=10000043&regionlimit=10000044&regionlimit=10000048&regionlimit=10000049&regionlimit=10000052&regionlimit=10000054&regionlimit=10000064&regionlimit=10000065&regionlimit=10000067&regionlimit=10000068&regionlimit=10000069&typeid=' + itemID, // Empire regions :D
      headers: {
        'User-Agent': 'EVE LP Helper v0.1'
      }
    }, function (response){
      var data = '';
      response.on('data', function(chunk) {
        data += chunk;
      });
      response.on('end', function(){
        xml2js.parseString(data, function (err, result){
          if (err) res.serverError(err); else if (result) {
            for (var item in result.evec_api.marketstat[0].type) {
              if (result.evec_api.marketstat[0].type.hasOwnProperty(item)){
                item = result.evec_api.marketstat[0].type[item];
                var sellMin = parseFloat(item.sell[0].min[0]), buyMax = parseFloat(item.buy[0].max[0]);
                Item.update({
                  itemID: itemID
                }, {
                  buyMax: buyMax,
                  sellMin: sellMin
                }).done(function (err) { if (err) res.serverError(err); else sails.log.info('Item' + itemID + ' updated from eve-central!') })
              }
            }
          }
        })
      })
    })
  },

  databaseRead: function (req, res) {
    var EventEmitter = new (require('events').EventEmitter);
    LPStore.destroy().done(function (err){ if (err) res.serverError(err); else {
      sails.log.debug('Offers database cleared!');
      EventEmitter.emit('database-cleared')
    } });
    EventEmitter.on('database-cleared', function(){
      var
        fs = require('fs'),
        files = fs.readdirSync('data'),
        path = require('path'),
        data, dataKeys;

      function processFile(file) { if (file) {
        var corporationID = path.basename(file, '.json');
        sails.log.debug('#' + corporationID + ': started processing file.');
        LPStoreController.checkCorporation(req, res, corporationID);
        data = JSON.parse(fs.readFileSync('data/' + file));
        dataKeys = Object.keys(data);

        function processOffer(dataKey) { if (dataKey) {
          var offer = data[dataKey];
          if (offer.reqItems) {
            var requirements = [];
            for (var item in offer.reqItems) { if (offer.reqItems.hasOwnProperty(item)) requirements.push({itemID: item, itemAmount: offer.reqItems[item]}) }
          }
          var hash = offer.typeID + '-' + offer.qty + '-' + offer.lpCost + '-' + offer.iskCost;
          LPStore.findOneByHash(hash).done((function(offer, corporationID, requirements){return function (err, offerInLPStore){ if (err) res.serverError(err);
            if (offerInLPStore) {
              var corporationList = offerInLPStore.corporationID;
              corporationList.push(corporationID);
              LPStore.update({
                hash: hash
              },{
                corporationID: corporationList
              }).done(function (err){ if (err) res.serverError(err); else sails.log.info('Offer ' + offer.typeID + ' updated corporation list!') })
            } else {
              LPStore.create({
                hash: offer.typeID + '-' + offer.qty + '-' + offer.lpCost + '-' + offer.iskCost,
                corporationID: [corporationID],
                priceLP: offer.lpCost,
                priceISK: offer.iskCost,
                itemID: offer.typeID,
                itemAmount: offer.qty,
                requirements: requirements
              }).done(function (err){ if (err) res.serverError(err); else sails.log.info('Offer ' + offer.typeID + ' created!') })
            }
          }}(offer, corporationID, requirements)));
          setTimeout(function(){
            sails.log.info('Started processing offer #' + offer.typeID);
            processOffer(dataKeys.shift())
          }, 1)
        } else {
          sails.log.debug('#' + corporationID + ': started processing last offer in file.');
          EventEmitter.emit('file-lastoffer', corporationID);
        }}
        processOffer(dataKeys.shift());
      } else return sails.log.debug('Done processing files!') }
      processFile(files.shift());

      EventEmitter.on('file-lastoffer', function(corporationID){
        sails.log.debug('#' + corporationID + ': iterating to next file.');
        //setTimeout(function(){
          processFile(files.shift())
        //}, 1000)
      })
    });

    res.send({action: 'LPStore:databaseRead', result: 'started'})
  },

  checkCorporation: function (req, res, corporationID) {
    Corporation.findOneByCorporationID(corporationID).done(function (err, corporation) {
      if (err) res.serverError(err); else if (!corporation) {
        var
          xml2js = require('xml2js'),
          https = require('https');
        https.get("https://api.eveonline.com/corp/CorporationSheet.xml.aspx?corporationID=" + corporationID, function (response){
          var data = '';
          response.on('data', function(chunk) {
            data += chunk;
          });
          response.on('end', function(){
            xml2js.parseString(data, function (err, result){
              if (err) res.serverError(err); else if (result) {
                var factionWarfare, factionID, factionName;
                data = result.eveapi.result[0];
                if (data.factionID) {
                  factionWarfare = true;
                  factionID = data.factionID;
                  factionName = data.factionName;
                } else {
                  factionWarfare = false;
                  factionID = 0;
                  factionName = 'unknown';
                }
                Corporation.create({
                  corporationID: data.corporationID,
                  corporationName: data.corporationName,
                  empireName: 'unknown',
                  factionWarfare: factionWarfare,
                  factionID: factionID,
                  factionName: factionName
                }).done(function (err) { if (err) res.serverError(err); })
              } else { res.serverError('Fail.') }
            })
          })
        })
      }
    })
  },

  updateDeep: function (req, res) {
    LPStore.find().done(function (err, offers){
      if (err) res.serverError(err); else if (offers) {
        for (var offer in offers) {
          if (offers.hasOwnProperty(offer)) {
            offer = offers[offer];
            LPStoreController.checkItem(req, res, offer.itemID);
            for (var item in offer.requirements) {
              if (offer.requirements.hasOwnProperty(item)){
                item = offer.requirements[item];
                LPStoreController.checkItem(req, res, item.itemID);
              }
            }
          }
        }
      }
    });
    res.send({action: 'lpstore-updatedeep', result: 'ok'})
  }

};

module.exports = LPStoreController;