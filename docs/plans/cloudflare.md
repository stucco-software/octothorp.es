To allow our scraper to access your website, please add our server IP to your Cloudflare WAF Allowlist. 

    Log in to your Cloudflare Dashboard . 
    Select the Account and the specific Domain you want to whitelist. 
    Go to the Security tab (on the left). 
    Click on WAF. 
    Ensure you are on the Custom rules tab. 
    Click Create rule. 
    Rule name: Enter Allow MyProject Scraper. 
    Field: Select IP Source Address. 
    Operator: Select equals. 
    Value: Paste our IP address: YOUR.SERVER.IP.ADDRESS 
    Action: Select Allow. 
    Click Deploy.
