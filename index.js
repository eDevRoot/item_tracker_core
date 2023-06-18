const { chromium } = require('playwright');
const { readFileSync, writeFile  } = require('fs');

function loadAndCheckSettings()
{
    const settings = JSON.parse(readFileSync('./settings.json'))

    if (settings.engines == null ||settings.queries == null)
    {
        console.log("Settings file is incorrect")
        return null
    }
    return settings
}

async function getResultFromURL(engine, query, browser, results, page_number = 1)
{
    const page = await browser.newPage()
    await page.goto(engine.url)

    if (query != null)
    {
        await page.waitForSelector(engine.input_selector)
        await page.type(engine.input_selector, query)
        await page.keyboard.press('Enter')
        await page.waitForNavigation({waitUntil: 'networkidle'})
    }

    const next_url =  await page.evaluate((engine) => {
        const x = document.querySelector(engine.next_selector)
        return x == null ? null : x.href
    }, engine)

    const r = await page.evaluate((engine) => {

        let results = []

        document.querySelectorAll(engine.items_selector).forEach((anchor) =>{

            const header = anchor.querySelector(engine.header_selector)
            const category = anchor.querySelector(engine.category_selector)
            const price = anchor.querySelector(engine.price_selector)

            results.push({
                id: anchor.getAttribute(engine.id_attribute),
                title: header.innerText,
                url: header.href,
                category: category.innerText,
                price: price.innerText,
                price_float: parseFloat(price.innerText.replace(' €', ''))
            });
        })

        return results;
    }, engine)

    results = results.concat(r)
    await page.close()
    console.log('Page number:', page_number)

    if (next_url == null || page_number >= engine.max_pages)
    {
        return results
    }
    let new_engine = Object.assign({}, engine)
    new_engine.url = next_url
    return getResultFromURL(new_engine, null, browser, results, page_number + 1)
}

function filterAndOrderResults(results, query)
{
    if (query.filters != null)
    {
        query.filters.forEach((key) => {
            results = results.filter((item) => {
                return item.category.toLowerCase().includes(key.toLowerCase())
            })
        })
    }

    if (query.max_price != null)
    {
        results = results.filter((item) => {
            return item.price_float <= query.max_price
        })
    }

    results = results.sort(function(a, b){
        return a.price_float - b.price_float
    })

    return results
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

    const settings = loadAndCheckSettings()
    if (settings == null) {
        return
    }

    let output = [];
    const browser =  await chromium.launch()

    for await (const engine of settings.engines)
    {
        for await (const query of settings.queries)
        {
            console.log('Scrapping:', query.item)
            let results = []
            results = await getResultFromURL(engine, query.item, browser, results)
            results = filterAndOrderResults(results, query)

            output.push({ query: query.item, results: results })
        }
    }

    await browser.close()
    writeJSONFile(JSON.stringify(output, null, 4))

})()
