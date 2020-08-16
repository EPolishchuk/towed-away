require('dotenv').config({ path: '../.env.local' });

const cron = require('node-cron');
const express = require('express');

const axios = require('axios').default;
const cheerio = require('cheerio');
const shortid = require('shortid');
const pool = require('./db');

const getPlates = async () => {
  try {
    const response = await axios.get(process.env.TOWED_URL);
    const data = await response.data;
    return parsePlates(data);
  } catch (error) {
    console.error(error);
  }
};

const parsePlates = (data) => {
  let list = [];

  let $ = cheerio.load(data);

  $('div.col-12.row')
    .eq(2)
    .find('.col-4')
    .each((i, e) => {
      let plate = {};

      if (i === 0 || i === 1) return;

      if (i % 2 === 0) {
        plate.number = $(e).text();
      } else {
        plate.date = $(e).text();
      }

      list.push(plate);
    });

  const plates = list.filter((el) => el.hasOwnProperty('number'));
  const dates = list.filter((el) => el.hasOwnProperty('date'));

  list = plates.map((el, i) => ({ plate: el.number, date: dates[i].date }));

  return list;
};

const main = async () => {
  const data = await getPlates();

  data.forEach(async (record, key, arr) => {
    setTimeout(async () => {
      // Import data into DB

      // Check if record exist
      //let domainDbId = data.domainId;

      try {
        const { plate, date } = record;

        const plateDb = await pool.query(
          'SELECT * FROM plates WHERE plate=$1 AND date=$2',
          [plate, date]
        );

        const result = plateDb.rows;

        if (!result.length) {
          try {
            await pool.query(
              'INSERT INTO plates (id, plate, date) VALUES ($1, $2, $3) RETURNING *',
              [shortid.generate(), plate, date]
            );
          } catch (error) {
            console.log(
              `INSERT failed on plate ${plate} with date ${date} with error ${error.message}`
            );
          }
        } else {
          return;
        }
      } catch (error) {
        console.log(
          `SELECT failed with data: ${JSON.stringify(record)} and error ${
            error.message
          }`
        );
      }
    }, 5000 * key);
  });

  console.log('Scraping done');
};

app = express();

cron.schedule('*/15 * * * *', function () {
  main();
  console.log('running a task every 15th minute');
});

app.listen(3128);
