<div class="container">

<h1>
  Vocabulary
</h1>

<h2>
  Term
</h2>
<p>Object Properties</p>
<ul>
  <li>created</li>
  <li>used</li>
</ul>

<h2>
  Origin
</h2>
<p>Object Properties</p>
<ul>
  <li>verified</li>
  <li>hasPart</li>
</ul>

<h2>
  Page
</h2>
<p>Object Properties</p>
<ul>
  <li>created</li>
  <li>used</li>
  <li>title</li>
  <li>description</li>
  <li>octothorpes</li>
  <li>[term]</li>
  <li>indexed</li>
  <li>mention</li>
</ul>

<h2>
  Content
</h2>
<p>Object Properties</p>
<ol>
  <li>partOf</li>
  <li>hasPart</li>
</ol>

<h2>Ring</h2>
<p>Subtype: page</p>
<p>Object Properties</p>
<ol>
  <li>hasPart</li>
</ol>

<h3>
  created
</h3>
<p>Timestamp</p>

<h3>
  used
</h3>
<p>Timestamp</p>

<h3>title</h3>
<p>String</p>

<h3>description</h3>
<p>String</p>

<h3>[term]</h3>
<p>Timestamp</p>
<p></p>

<h3>indexed</h3>
<p>Timestamp</p>
<p>Last time the server indexed this page.</p>

<h3>octothorpes</h3>
<p>Page, Term</p>


<h3>octothorpedBy</h3>
<p>Inverse: octothorpes</p>

<h3>verified</h3>
<p>Boolean</p>

<h3>hasPart</h3>
<p>Origin || Page || Content</p>

<h3>partOf</h3>
<p>Origin || Page || Content</p>
<p>inverse: hasPart</p>

<h3>mention</h3>
<p>Entity</p>

</div>

