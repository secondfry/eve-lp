module.exports = {

  attributes: {

    hash: {
      type: 'string',
      required: true,
      unique: true
    },
    itemID: 'integer',
    itemAmount: 'integer',
    priceLP: 'integer',
    priceISK: 'integer',
    requirements: 'json', // [{itemID: "", itemAmount: ""},..]
    requirementsPrice: 'float',
    profitISK: 'float',
    profitISKPerLP: 'float',
    corporationID: 'array' // [corporationID,..]


  }

};