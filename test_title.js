import axios from 'axios';
import * as cheerio from 'cheerio';
axios.get('https://idilesom.com/perm/places/3803').then(res => {
  const $ = cheerio.load(res.data);
  let possibleTitles = [];
  
  $('*').each((i, el) => {
    if ($(el).children().length === 0 && $(el).text().trim() === 'Камень Ветлан') {
        const parent = $(el).parent();
        possibleTitles.push({
           class: parent.attr('class'),
           tag: parent.prop('tagName'),
           text: $(el).text().trim()
        });
    }
  });
  console.log(possibleTitles);
}).catch(e => console.log(e.message));
