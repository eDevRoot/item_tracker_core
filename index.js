const { chromium } = require('playwright');
const { readFileSync, writeFile  } = require('fs');

async function getResultFromURL(url, query, browser, results)
{
    if (results == null)
    {
        results = []
    }

    const page = await browser.newPage()
    await page.goto(url)
    if (query != null)
    {
        await page.waitForSelector('input[name="bu"]')
        await page.type('input[name="bu"]', query)
        await page.keyboard.press('Enter')
        await page.waitForNavigation({waitUntil: 'networkidle'})
    }

    const next_url =  await page.evaluate(() => {
        const x = document.querySelector('a.page-link.pager-next')
        return x == null ? null : x.href
    })

    const r = await page.evaluate(() => {

        let results = []

        document.querySelectorAll('div._lote_item').forEach((anchor) =>{

            const header = anchor.querySelector('div._lote_content-body h3 a')
            const category = anchor.querySelector('p._lote_item-section a')
            const price = anchor.querySelector('span.text-nowrap.precio-lote-listado')

            results.push({
                id: anchor.getAttribute('data-id-lote'),
                title: header.innerText,
                url: header.href,
                category: category.innerText,
                price: price.innerText});
        })

        return results;
    })
    results = results.concat(r)
    if (next_url == null)
    {
        return results
    }
    return getResultFromURL(next_url, null, browser, results)
}

function writeJSONFile(data)
{
    writeFile("./output.json", data, function(err)
    {
        if (err)
        {
            console.log(err);
        }
    })
}

(async () => {

    const settings = JSON.parse(readFileSync('./settings.json'))

    let output = [];
    let results = [];
    const browser =  await chromium.launch()
    for await (const item of settings.queries)
    {
        console.log('Scrapping:', item)
        results = await getResultFromURL('https://www.todocoleccion.net/', item, browser, null)
        output.push({
            query: item,
            results: results
        })
    }
    await browser.close()

    writeJSONFile(JSON.stringify(output, null, 4))

})()

