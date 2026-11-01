// Built-in ad / tracker host list (a compact core; "Update filter list" in Settings > SKBrowse downloads a much bigger one).
const HOSTS = `doubleclick.net googlesyndication.com googleadservices.com google-analytics.com googletagmanager.com googletagservices.com adservice.google.com pagead2.googlesyndication.com
2mdn.net adnxs.com adsrvr.org adform.net advertising.com amazon-adsystem.com criteo.com criteo.net taboola.com outbrain.com revcontent.com mgid.com
rubiconproject.com pubmatic.com openx.net casalemedia.com indexww.com smartadserver.com sharethrough.com triplelift.com 33across.com lijit.com sovrn.com
moatads.com adsafeprotected.com doubleverify.com scorecardresearch.com quantserve.com quantcount.com chartbeat.com chartbeat.net hotjar.com crazyegg.com
mixpanel.com segment.io segment.com fullstory.com mouseflow.com optimizely.com bluekai.com demdex.net krxd.net exelator.com agkn.com rlcdn.com
adsymptotic.com bidswitch.net contextweb.com yieldmo.com teads.tv spotxchange.com spotx.tv springserve.com stickyadstv.com freewheel.tv tubemogul.com
adcolony.com applovin.com unity3d.com/ads vungle.com chartboost.com inmobi.com mopub.com smaato.net startappservice.com
popads.net popcash.net propellerads.com exoclick.com juicyads.com trafficjunky.net trafficfactory.biz clickadu.com hilltopads.net adsterra.com adcash.com
zedo.com yllix.com onclickads.net onclkds.com bidvertiser.com revenuehits.com adk2.co adnium.com admaven.com a-ads.com coinzilla.com
ads.yahoo.com advertising.yahoo.com ads.twitter.com analytics.twitter.com ads-twitter.com static.ads-twitter.com ads.linkedin.com px.ads.linkedin.com
connect.facebook.net/signals ads.pinterest.com ads.tiktok.com analytics.tiktok.com business-api.tiktok.com ads.reddit.com events.reddit.com
imrworldwide.com adtechus.com adtech.de serving-sys.com eyeota.net tapad.com turn.com mathtag.com sitescout.com simpli.fi bttrack.com adroll.com
perfectaudience.com retargetly.com liadm.com id5-sync.com pippio.com ml314.com brightcove.net/ads ads.youtube.com
cdn.ads.microsoft.com ads.msn.com bat.bing.com clarity.ms
newrelic.com/ads nr-data.net sentry.io/ads datadoghq.com/rum
adbrite.com adblade.com adtegrity.net admixer.net adscale.de adspirit.de advertserve.com adzerk.net carbonads.com buysellads.com
serving.carbonads.com srv.buysellads.com cdn.carbonads.com ad.doubleclick.net securepubads.g.doubleclick.net
vidazoo.com vidoomy.com connatix.com primis.tech seedtag.com minutemedia.com ezoic.net ezoic.com ezodn.com ezojs.com mediavine.com adthrive.com raptive.com
cdn.adsafeprotected.com pixel.quantserve.com pixel.adsafeprotected.com track.adform.net match.adsrvr.org sync.outbrain.com widgets.outbrain.com
trc.taboola.com cdn.taboola.com nexus.ensighten.com tags.tiqcdn.com tealiumiq.com ensighten.com`.split(/\s+/).map(x => x.replace(/\/.*$/, '').toLowerCase()).filter(Boolean);
const PATHS = [/\/(?:ads?|adserver|adframe|advert(?:s|ising)?|banners?|sponsored|prebid)\/(?!.*\.(?:css|woff2?)$)/i, /[?&](?:ad_type|adunit|adslot|ad_slot)=/i, /\/(?:pagead|ads\/show|gampad|adsbygoogle|doubleclick|pixel\.gif|beacon\.js|analytics\.js|gtag\/js|fbevents\.js)/i, /\/ima3\.js|\/prebid[\w.-]*\.js|\/adsbygoogle\.js/i];
// Page elements that are ads. Injected as CSS so empty ad boxes do not leave holes or banners.
const CSS = `ins.adsbygoogle,.adsbygoogle,[id^="google_ads"],[id^="div-gpt-ad"],[class*="ad-banner"],[class*="adbanner"],[class*="advert"],[id*="advert"],[class*="sponsored-"],[class^="ad-slot"],[class*=" ad-slot"],[data-ad-slot],[data-ad-unit],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[id^="google_ads"],.ad-container,.ad-wrapper,.adsbox,.ad_unit,.ad-unit,.taboola,.OUTBRAIN,[id^="taboola-"],[id^="outbrain"],ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,ytd-promoted-sparkles-web-renderer,#masthead-ad,#player-ads,.ytp-ad-overlay-container,.ytp-ad-image-overlay,.ytp-paid-content-overlay{display:none!important}`;
// YouTube: skip or fast-forward video ads, click "Skip", close overlay ads. (YouTube changes this often; the filter list can lag behind.)
const YT = `(function(){if(window.__skyt)return;window.__skyt=1;setInterval(function(){try{var p=document.querySelector('.html5-video-player');if(!p)return;var ad=p.classList.contains('ad-showing')||document.querySelector('.ytp-ad-player-overlay,.ytp-ad-text');var v=document.querySelector('video.html5-main-video');if(ad&&v&&isFinite(v.duration)&&v.duration>0){v.muted=true;v.playbackRate=16;v.currentTime=Math.max(0,v.duration-0.1);}else if(v&&v.playbackRate===16){v.playbackRate=1;v.muted=false;}var b=document.querySelector('.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-ad-skip-button-container button');if(b)b.click();var c=document.querySelector('.ytp-ad-overlay-close-button');if(c)c.click();}catch(e){}},350);})();`;
module.exports = { HOSTS, PATHS, CSS, YT };
