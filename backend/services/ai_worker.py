import requests

def analyze_supplier_email_with_ai(email_body: str):
    """
    Connects to an open-source LLM (like Llama 3 via Ollama)
    to parse email text for matrix updates.
    """
    OLLAMA_URL = "http://host.docker.internal:11434/api/generate"
    
    prompt = f"""
    Analyze the following supplier email. 
    Extract: Pricing, Lead Time, Minimum Order Quantity (MoQ), and Current Status (Negotiating, Samples, Production).
    Format the output as strict JSON.
    
    Email:
    {email_body}
    """
    
    try:
        response = requests.post(OLLAMA_URL, json={
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }, timeout=30)
        
        if response.status_code == 200:
            return response.json().get("response")
        return None
    except Exception as e:
        print(f"Error accessing Llama AI: {e}")
        return None
