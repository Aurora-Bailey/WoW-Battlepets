const MongoDB = require('./mongodb.js')
const petinfo = require('./petinfo.js')
const wow_battlepets = new MongoDB('wow_battlepets')
const wowapi = require('./wow-api.js')
const express = require('express')
const app = express()

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  next()
})

app.get('/realms', async function (req, res) {
  console.log('get realms')
  let db = await wow_battlepets.getDB()
  let realms = await db.collection('realms').find({}).toArray()
  res.send(JSON.stringify(realms))
})

app.get('/health', async function (req, res) {
  console.log('get realms')
  let db = await wow_battlepets.getDB()
  let health = await db.collection('auction_house_health').find({}).toArray()
  res.send(JSON.stringify(health))
})







app.get('/collection', async function (req, res) {
  console.log('collection')
  let pets = await wowapi.characterPets (req.query.region, req.query.realm, req.query.character)
  let db = await wow_battlepets.getDB()
  let averageRegionParent = await db.collection('average_region').find({region: req.query.region}).toArray()
  if (averageRegionParent.length === 0) {res.send(JSON.stringify({error: 'region averages not found', code: 1502, query: req.query})); return false}
  let averageRegionData = averageRegionParent[0].data

  // add name and icon
  for (var index in pets) {
    if (pets.hasOwnProperty(index)) {
      try {
        pets[index].name = await petinfo.petIdName(pets[index].speciesId)
        pets[index].icon = await petinfo.petIdImage(pets[index].speciesId)
      } catch (e) {
        pets[index].name = 'error'
        pets[index].icon = 'error'
      }
    }
  }

  // remove unknown
  pets = pets.filter(pet => {
    if (pet.level !== 25) pet.level = 1
    pet.level = '' + pet.level
    if (pet.name === 'error') return false
    if (typeof averageRegionData[pet.speciesId] === 'undefined') return false
    if (typeof averageRegionData[pet.speciesId][pet.level] === 'undefined') return false
    if (typeof averageRegionData[pet.speciesId][pet.level]['sold_median'] === 'undefined') return false
    return true
  })

  pets.forEach(pet => {
    pet.sold_median = averageRegionData[pet.speciesId][pet.level]['sold_median']
    pet.sold_num = averageRegionData[pet.speciesId][pet.level]['sold_num']
  })


  res.send(JSON.stringify(pets))
})





app.get('/sell', async function (req, res) {
  console.log('sell in realms')
  let pets = await wowapi.characterPets (req.query.region, req.query.realm, req.query.character)
  // let db = await wow_battlepets.getDB()
  // let averageRegionParent = await db.collection('average_region').find({region: req.query.region}).toArray()
  // if (averageRegionParent.length === 0) {res.send(JSON.stringify({error: 'region averages not found', code: 1502, query: req.query})); return false}
  // let averageRegionData = averageRegionParent[0].data

  res.send(JSON.stringify(pets))
})

app.get('/buy', async function (req, res) {
  if (typeof req.query.maxbuyout === 'undefined') req.query.maxbuyout = 10000000000000
  if (typeof req.query.minmargin === 'undefined') req.query.minmargin = 0
  if (typeof req.query.minpercent === 'undefined') req.query.minpercent = 0
  console.log('buy', req.query.ah + '-' + req.query.region)
  let db = await wow_battlepets.getDB()
  let auctionsLiveParent = await db.collection('auctions_live').find({auction_house: req.query.ah + '-' + req.query.region}).toArray()
  if (auctionsLiveParent.length === 0) {res.send(JSON.stringify({error: 'auction house not found', code: 1501, query: req.query})); return false}
  let auctionsLive = auctionsLiveParent[0].auctions

  let liveRealmData = {}
  auctionsLive.forEach(pet => {
    if (typeof liveRealmData[pet.petSpeciesId] === 'undefined') liveRealmData[pet.petSpeciesId] = {}
    if (typeof liveRealmData[pet.petSpeciesId][pet.petLevel] === 'undefined') liveRealmData[pet.petSpeciesId][pet.petLevel] = {}
    if (typeof liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut'] === 'undefined') liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut'] = pet.buyout
    if (typeof liveRealmData[pet.petSpeciesId][pet.petLevel]['num'] === 'undefined') liveRealmData[pet.petSpeciesId][pet.petLevel]['num'] = 0
    if (pet.buyout < liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut']) liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut'] = pet.buyout
    liveRealmData[pet.petSpeciesId][pet.petLevel]['num']++
  })

  let averageRegionParent = await db.collection('average_region').find({region: req.query.region}).toArray()
  if (averageRegionParent.length === 0) {res.send(JSON.stringify({error: 'region averages not found', code: 1502, query: req.query})); return false}
  let averageRegionData = averageRegionParent[0].data

  let averageRealmParent = await db.collection('average_realm').find({realm: req.query.ah + '-' + req.query.region}).toArray()
  if (averageRealmParent.length === 0) averageRealmParent = [{data: {}}]
  let averageRealmData = averageRealmParent[0].data

  let buyable = auctionsLive.filter(pet => {
    if (pet.buyout > req.query.maxbuyout) return false
    if (pet.buyout == 0) return false
    if (typeof averageRegionData[pet.petSpeciesId] === 'undefined') return false
    if (typeof averageRegionData[pet.petSpeciesId][pet.petLevel] === 'undefined') return false
    if (typeof averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_median'] === 'undefined') return false
    if (pet.buyout < averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_median'] * 0.95) {
      if (liveRealmData[pet.petSpeciesId] && liveRealmData[pet.petSpeciesId][pet.petLevel] && liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut']) pet.realm_undercut = liveRealmData[pet.petSpeciesId][pet.petLevel]['undercut']
      else pet.realm_undercut = 0
      if (liveRealmData[pet.petSpeciesId] && liveRealmData[pet.petSpeciesId][pet.petLevel] && liveRealmData[pet.petSpeciesId][pet.petLevel]['num']) pet.realm_num = liveRealmData[pet.petSpeciesId][pet.petLevel]['num']
      else pet.realm_num = 0
      if (averageRealmData[pet.petSpeciesId] && averageRealmData[pet.petSpeciesId][pet.petLevel] && averageRealmData[pet.petSpeciesId][pet.petLevel]['sold_median']) pet.realm_sold_median = averageRealmData[pet.petSpeciesId][pet.petLevel]['sold_median']
      else pet.realm_sold_median = 0
      if (averageRealmData[pet.petSpeciesId] && averageRealmData[pet.petSpeciesId][pet.petLevel] && averageRealmData[pet.petSpeciesId][pet.petLevel]['sold_num']) pet.realm_sold_num = averageRealmData[pet.petSpeciesId][pet.petLevel]['sold_num']
      else pet.realm_sold_num = 0
      if (typeof averageRegionData[pet.petSpeciesId]['1'] === 'undefined' || typeof averageRegionData[pet.petSpeciesId]['1']['sold_median'] === 'undefined'){
        pet.region_sold_median_1 = 0
        pet.region_sold_num_1 = 0
      }
      else {
        pet.region_sold_median_1 = averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_median']
        pet.region_sold_num_1 = averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_num']
      }
      pet.region_sold_median = averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_median']
      pet.region_sold_num = averageRegionData[pet.petSpeciesId][pet.petLevel]['sold_num']
      pet.region_margin = pet.region_sold_median - pet.buyout
      pet.region_percent = (100/pet.buyout) * pet.region_margin
      pet.realm_margin = pet.realm_sold_median - pet.buyout
      pet.realm_percent = (100/pet.buyout) * pet.realm_margin
      if (req.query.minmargin > pet.region_margin) return false
      if (req.query.minpercent > pet.region_percent) return false
      return true
    }
    return false
  })

  for (var index in buyable) {
    if (buyable.hasOwnProperty(index)) {
      buyable[index].name = await petinfo.petIdName(buyable[index].petSpeciesId)
      buyable[index].icon = await petinfo.petIdImage(buyable[index].petSpeciesId)
    }
  }

  res.send(JSON.stringify(buyable))
})


app.listen(3303)
