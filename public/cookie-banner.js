// cookie-banner.js
// Injectable snippet for www.bruenel.de to track BI telemetry for Brünel OS

(function() {
    const API_ENDPOINT = "https://app-bruenel-de-backend.vercel.app/api/bi/track";
    
    // Generate or retrieve a temporary session ID using sessionStorage (cleared when browser closes)
    function getSessionId() {
        let sid = sessionStorage.getItem("bruenel_sid");
        if (!sid) {
            sid = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            sessionStorage.setItem("bruenel_sid", sid);
        }
        return sid;
    }

    function hasConsent() {
        return localStorage.getItem("bruenel_consent") === "given" ? 1 : 0;
    }
    
    function mapPathToKST(path) {
        if (path.includes("hardware")) return 3000;
        if (path.includes("iran-store") || path.includes("home")) return 2000;
        return 0; // default general
    }

    // Function to track an event
    function trackEvent(eventType = "pageview", additionalData = {}) {
        const payload = {
            referral: document.referrer || "direct",
            device_type: navigator.userAgent.includes("Mobi") ? "Mobile" : "Desktop",
            mapped_kst_interest: mapPathToKST(window.location.pathname),
            page_url: window.location.pathname + window.location.search,
            session_id: getSessionId(),
            event_type: eventType,
            consent_given: hasConsent(),
            ...additionalData
        };
        
        fetch(API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
            // Use keepalive for click/unload events to ensure delivery
        }).catch(err => console.error("Telemetry error", err));
    }

    // 1. Track initial pageview immediately (before consent)
    trackEvent("pageview");

    // 2. Track all clicks on the website
    document.addEventListener("click", function(e) {
        // Find if they clicked an actionable element
        let target = e.target;
        let isActionable = false;
        
        while (target && target !== document.body) {
            if (target.tagName === 'A' || target.tagName === 'BUTTON' || target.closest('a, button')) {
                isActionable = true;
                break;
            }
            target = target.parentElement;
        }

        if (isActionable && target) {
            trackEvent("click", {
                // We can pass extra data if the backend accepts it, otherwise just event_type="click"
            });
        }
    });

    // If consent is already given or denied, we don't show the banner
    if (localStorage.getItem("bruenel_consent")) {
        return;
    }
  
    // Create Banner UI
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "20px";
    banner.style.left = "20px";
    banner.style.right = "20px";
    banner.style.backgroundColor = "#0d0d0d"; // Black
    banner.style.color = "#ffffff";
    banner.style.padding = "24px";
    banner.style.borderRadius = "12px";
    banner.style.border = "1px solid rgba(255,255,255,0.1)";
    banner.style.boxShadow = "0 20px 40px rgba(0,0,0,0.5)";
    banner.style.zIndex = "999999";
    banner.style.display = "flex";
    banner.style.flexDirection = "column";
    banner.style.gap = "16px";
    banner.style.fontFamily = "system-ui, sans-serif";
    
    // Content
    const textNode = document.createElement("div");
    textNode.innerHTML = "<h3 style='margin:0 0 8px 0;font-size:16px;'>We Value Your Privacy</h3><p style='margin:0;font-size:14px;color:#a1a1aa;line-height:1.5;'>To deliver personalized experiences and optimize our service streams, we securely log anonymized telemetry data in accordance with GDPR. Read our <a href='/#datenschutz' style='color:#FF6B00;'>Privacy Policy</a>.</p>";
    
    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.gap = "12px";
    actions.style.justifyContent = "flex-end";
    
    const acceptBtn = document.createElement("button");
    acceptBtn.innerText = "Accept All";
    acceptBtn.style.backgroundColor = "#FF6B00"; // Orange Accent
    acceptBtn.style.color = "#fff";
    acceptBtn.style.border = "none";
    acceptBtn.style.padding = "10px 20px";
    acceptBtn.style.borderRadius = "6px";
    acceptBtn.style.cursor = "pointer";
    acceptBtn.style.fontWeight = "bold";
    
    const denyBtn = document.createElement("button");
    denyBtn.innerText = "Decline";
    denyBtn.style.backgroundColor = "transparent";
    denyBtn.style.color = "#ffffff";
    denyBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    denyBtn.style.padding = "10px 20px";
    denyBtn.style.borderRadius = "6px";
    denyBtn.style.cursor = "pointer";
  
    actions.appendChild(denyBtn);
    actions.appendChild(acceptBtn);
    
    banner.appendChild(textNode);
    banner.appendChild(actions);
    
    document.body.appendChild(banner);
  
    // Logic
    acceptBtn.addEventListener("click", () => {
        localStorage.setItem("bruenel_consent", "given");
        banner.remove();
        trackEvent("consent_given"); // Track the moment they consent
    });
    
    denyBtn.addEventListener("click", () => {
        localStorage.setItem("bruenel_consent", "denied");
        banner.remove();
    });
})();
