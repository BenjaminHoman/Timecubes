const express = require('express')
const app = express()
const port = 3000

app.use(express.static('public'))
app.use(express.static('assets'))

// Ignore Favicon. For now it is annoying.
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/', (req, res) => {
    res.send('Hello World!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})