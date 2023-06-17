const { chromium } = require('playwright');
const { readFileSync, writeFile  } = require('fs');

async function getResultsFromTodoColeccion(query, browser)
{
    const page = await browser.newPage()
    await page.goto('https://www.todocoleccion.net/')
    await page.waitForSelector('input[name="bu"]')
    await page.type('input[name="bu"]', query)
    await page.keyboard.press('Enter')
    await page.waitForNavigation({waitUntil: 'networkidle'})

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

    return r
}

(async () => {

    const settings = JSON.parse(readFileSync('./settings.json'))

    let output = [];
    const browser =  await chromium.launch()
    for await (const item of settings.queries)
    {
        console.log('Scrapping:', item)
        const results = await getResultsFromTodoColeccion(item, browser)
        output.push({
            query: item,
            results: results
        })
    }
    await browser.close()

    writeFile("./output.json", JSON.stringify(output), function(err) {
        if (err) {
            console.log(err);
        }
    })

})()

