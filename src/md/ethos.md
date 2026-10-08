---
type: Documentation
prefLabel: Ethos
---

## Ethos Document

> This is a working document. Community feedback is welcomed and encouraged.


## The Octothorpe Protocol is founded on, and embodies, the following principles:

- individuals should be able to control how they share and aggregate content
- content made by humans for other humans should be made accessible to humans over bots
- plain html websites should be able to participate in modern social networks
- you should be able to own your own data in a format that is easy to read
- you should be in charge of how, when, and why you  connect your own data to outside services.
- public internet services should have transparent, consistent and clear policies
- your right of exit is paramount and should be assumed
- you should have rational access to information you post
- you should have tools to moderate and customize your own feeds



### OP is not just code -- it is also a network that connects other websites. In our own stewarship of the parts of this network that we control, we will follow these policies on the octothorp.es server

- do not crawl or scrape urls that have not explicitly asked us to
- do not access websites at non-human speeds
- do not store anything from urls we scrape beyond our defined vocabulary
- do not gather any PII
- do not track any non-anonymous browser activity 
- do not gate, interpret via algorithm, or otherwise influence the information sent to us by the users
- do not allow abusive content on the network
- do not seek to enclose what is open



## As an organization and individuals we assure the following:

- OP and its underlying source code will always be free and open source
- We will not use data we have access to as a resource to profit off of
- No existing services will be reduced as a form of rent-seeking
- We will not send any data we can access to third-party services for any reason without the express permission of the owners of that data


### How our goals for OP relate to these assurances:

- Any funding or other financial support we seek for OP or related projects must not change the principles and assurances described here
- If we lose the ability to afford hosting for octothorp.es, we will seek new maintainers for the project from the OP community
- If no new maintainers can be found, we will place the server in a read-only mode, retaining as much access and functionality that we can sustain.
- We will provide a mechanism for any product built with OP to clearly indicate their compliance with these principles and policies.

How we implement these principles:
- we use webpages and other addressable documents as their own canonical source of data
- all official OP code is open source and public
- we manually review every registration for our own server
- our indexing system requires registered sites to actively request that we look at their site
- the [indexing policy](https://docs.octothorp.es/indexing-policy/) system allows sites that cannot actively request indexing to expressly declare permission
- we respect robots.txt restrictions
- we send an identifiable user-agent header when scraping
- we have an openly accessible API
- we provide lightweight HTML snippets, web components, and basic JS scripts to make participation as easy as possible
- the backend does not require intensive resources to host
- the [harmonizer](https://docs.octothorp.es/harmonizers/) system allows sites to use their own custom markup to send us data
- the [multipass](https://docs.octothorp.es/multipass/) system allows users to build and save their own highly filtered and customized feeds


## Upcoming improvements

as of v0.6 we are building:

- a structured OP Client policy that any project using OP can use to define and advertise its own policy like we have here
- a system to publish data in any definable structured format
- a lightweight, low-dependency npm pacakge for the core features of OP
- File-based data storage to allow for p2p connections and OP apps that don't require a database
