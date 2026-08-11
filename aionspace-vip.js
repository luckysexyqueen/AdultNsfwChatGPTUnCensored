(function () {
  function insertFixedAdBanner(htmlContent) {
    if (!document.getElementById("fixed-ad-banner-style")) {
      const style = document.createElement("style");
      style.id = "fixed-ad-banner-style";
      style.innerHTML = `
      .fixed-ad-banner {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        background: black;
        color: white;
        font-size: 14px;
        text-align: center;
        padding: 10px 0;
        z-index: 99999;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        font-weight: bold;
      }
    `;
      document.head.appendChild(style);
    }

    const adBanner = document.createElement("div");
    adBanner.className = "fixed-ad-banner";
    adBanner.innerHTML = htmlContent;

    document.body.insertBefore(adBanner, document.body.firstChild);

    function adjustLayout() {
      const bannerHeight = adBanner.offsetHeight;

      document.body.style.paddingTop = bannerHeight + "px";

      const nav = document.querySelector("nav");
      if (nav) {
        const position = getComputedStyle(nav).position;
        if (position === "fixed" || position === "sticky") {
          nav.style.top = bannerHeight + "px";
        } else {
          nav.style.top = "";
        }
      }
    }

    window.addEventListener("load", adjustLayout);
    window.addEventListener("resize", adjustLayout);
    new ResizeObserver(adjustLayout).observe(adBanner);
  }

  function addAdBanner() {
    insertFixedAdBanner(`
  <div>
    <a href="https://www.onspace.ai" target="_blank" style="">
      Ideas → Web (0 Code) | OnSpace.AI
      <span style="
          border: 1px solid;
          border-radius: 17px;
          width: 112px;
          justify-content: center;
          text-align: center;
          display: inline-flex;
          height: 35px;
          align-items: center;
          margin-left: 10px;
      ">Try Now</span>
    </a>
  </div>
`);
  }

  async function checkVipStatus() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      let apiUrl =
        "https://api.onspace.ai/api/user/getvipbydomain";
      if (urlParams.toString()) {
        apiUrl += `?${urlParams.toString()}`;
      }

      const response = await fetch(apiUrl);
      const data = await response.json();

      if (data && data.errNo === 0 && data.data && data.data.isVip === 0) {
        addAdBanner();
      }
    } catch (error) {
      addAdBanner();
    }
  }

  window.addEventListener("load", checkVipStatus);
})();
