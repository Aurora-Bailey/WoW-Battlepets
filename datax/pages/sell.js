const MongoDB = require('../api/mongodb.js')
const kaisBattlepets = new MongoDB('kaisBattlepets')
const wow = require('../api/wow.js')
const lib = require('../api/lib.js')

class Sell {
  constructor () {

  }

  async request (query) {
    query.rid = parseInt(query.rid)
    let sellAt = query.sellat.split('-')

    // get pets from blizzard
    let pets = await wow.getCharacterPets(query.rid, query.name)

    let db = await kaisBattlepets.getDB()

    for (var petIndex in pets) {
      let pet = pets[petIndex]
      pet.sellAt = []
      for (var sellIndex in sellAt) {
        let ahid = sellAt[sellIndex]

        let ah = await lib.auctionHouse(ahid)
        let average = await db.collection('average').findOne({psid: pet.stats.speciesId, region: ah.regionTag, petLevel: pet.stats.level == 25 ? 25:1}, {projection: {_id: 0, sold:1}})
        if (average === null) average = {sold: {median: 0}}

        let petAuctionUndercut = await db.collection('auctionsLive').findOne({ahid, petSpeciesId: pet.stats.speciesId, buyout: {$lt: average.sold.median}}, {projection: {_id: 1}})
        let undercut = petAuctionUndercut === null
        let health = await lib.auctionHouseHealth(ahid)

        pet.sellAt.push({ahid, undercut, price: average.sold.median, sellrate: health.sellRate})
      }
      pet.sellAt.sort((a,b) => {
        if (a.undercut != b.undercut) return a.undercut ? -1:1
        return a.sellrate - b.sellrate
      })
    }
    return pets.map(p => {return {psid: p.stats.speciesId, level: p.stats.level, guid: p.battlePetGuid, sellIndex: 0, sellAt: p.sellAt}})
  }

  async petAverageAuctionHouseSold (psid, level, ahid) {
    psid = parseInt(psid)
    level = parseInt(level)
    if (level !== 25) level = 1
    let db = await kaisBattlepets.getDB()
    let average = await db.collection('average').findOne({psid, petLevel: level, ahid}, {projection: {_id: 0, sold: 1, ahid: 1, psid: 1, petLevel: 1}})
    return average
  }
}

module.exports = new Sell()
