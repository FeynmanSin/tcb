const cloudBase = require('@cloudbase/node-sdk');
const { SECRET_ID, SECRET_KEY } = process.env;

const tcb = cloudBase.init({
  env: 'sin-8ggq50jzd79a5e10',
  secretId: SECRET_ID,
  secretKey: SECRET_KEY,
  region: 'ap-guangzhou'
});


module.exports = tcb;