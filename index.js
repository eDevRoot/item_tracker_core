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

    if (query != null && engine.input_selector != null)
    {
        await page.waitForSelector(engine.input_selector)
        await page.type(engine.input_selector, query)
        await page.keyboard.press('Enter')
        await page.waitForNavigation({waitUntil: 'networkidle'})
    }

    const next_url =  await page.evaluate((engine) => {
        let next_url = null
        if (engine.next_selector != null && document.querySelector(engine.next_selector) != null)
        {
            next_url = document.querySelector(engine.next_selector).href
        }
        return next_url
    }, engine)

    const r = await page.evaluate((engine) => {

        let results = []
        if (engine.items_selector == null)
        {
            return results
        }

        document.querySelectorAll(engine.items_selector).forEach((anchor, index) => {

            //ID
            let item_id = index
            if (engine.id_attribute != null)
            {
                item_id = anchor.getAttribute(engine.id_attribute)
                if (engine.name === "Ebay")
                {
                    item_id = JSON.parse(item_id).trackableId
                }
            }

            //TITLE
            let title = null
            let item_url = null
            if (engine.header_selector != null && anchor.querySelector(engine.header_selector) != null)
            {
                title = anchor.querySelector(engine.header_selector).innerText
                let i = title.indexOf('\n')
                if (i > 0)
                {
                    title = title.slice(0, i)
                }
                item_url = anchor.querySelector(engine.header_selector).href
            }

            //IMAGE
            let image_src = null
            if (engine.image_selector != null && anchor.querySelector(engine.image_selector) != null)
            {
                image_src = anchor.querySelector(engine.image_selector).src
            }

            //CATEGORY
            let category = null
            if (engine.category_selector != null && anchor.querySelector(engine.category_selector) != null)
            {
                category = anchor.querySelector(engine.category_selector).innerText
            }

            //PRICE
            let price = null
            let fprice = null
            let ftotal = null
            if (engine.price_selector != null && anchor.querySelector(engine.price_selector) != null)
            {
                price = anchor.querySelector(engine.price_selector).innerText
                price = price.replace('+', '')
                    .replace(' de envío', '')
                    .replace('estimado', '')
                    .replace('€', 'EUR')
                    .trim()
                fprice = parseFloat(price.replace('€', '').replace(',','.'))
                ftotal = fprice
            }

            //SHIPPING
            let shipping = "Free"
            let fshipping = 0.0
            if (engine.shipping_selector != null && anchor.querySelector(engine.shipping_selector) != null)
            {
                shipping = anchor.querySelector(engine.shipping_selector).innerText
                shipping = shipping.replace('+', '')
                    .replace(' de envío', '')
                    .replace('estimado', '')
                    .replace('€', 'EUR')
                    .trim()
                fshipping = parseFloat(shipping.replace(' €', '').replace(',','.'))
                ftotal = fprice + fshipping
            }

            //OFFERS
            let admits_offers = null
            if (engine.offers_selector != null)
            {
                admits_offers = anchor.querySelector(engine.offers_selector) != null
                if (engine.name === "Ebay" && anchor.querySelector(engine.offers_selector) != null)
                {
                    admits_offers = anchor.querySelector(engine.offers_selector).innerText.toLowerCase().includes("oferta")
                }
            }

            //AUCTIONS
            let is_auction = null
            if (engine.auctions_selector != null)
            {
                is_auction = anchor.querySelector(engine.auctions_selector) != null
            }

            results.push({
                id: item_id,
                title: title,
                image: image_src,
                url: item_url,
                category: category,
                price: price,
                shipping: shipping,
                price_float: fprice,
                shipping_float: fshipping,
                total_float: ftotal,
                admits_offers: admits_offers,
                is_auction: is_auction
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
                if (item.category == null)
                {
                    return true
                }
                return item.category.toLowerCase().includes(key.toLowerCase())
            })
        })
    }

    if (query.max_price != null)
    {
        results = results.filter((item) => {
            return item.total_float <= query.max_price
        })
    }

    results = results.sort(function(a, b){
        return a.total_float - b.total_float
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
            console.log(`Scrapping: ${query.item} - Engine: ${engine.name}`)
            let results = []
            results = await getResultFromURL(engine, query.item, browser, results)
            results = filterAndOrderResults(results, query)

            output.push({ query: query.item, engine: engine.url, results: results })
        }
    }

    await browser.close()
    writeJSONFile(JSON.stringify(output, null, 4))

})()
