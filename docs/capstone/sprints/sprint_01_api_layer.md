## LadyLinux Sprint 01, API_Layer

2026 Capstone Project

# Backlog Update: Application-Layer Refresh Capability

**Feature Area:** Coding/API Development
**Related Sprint Item:** Refactor Python Code to rely on Python os
**Status:** Pending (Embedded Model Planning Phase)

---

## 1. Original Backlog Intent (Restated)

The original backlog item asked for:

Refactor the Python code to rely on Python's `os` module for filesystem interactions.

The core 'firewall demo' feature was built as a MVP rapid prototype. It was never intended to be a scalable solution.

The initial 'ask' is:

``` fulltext
The api_layer.py file is in truth a rapid MVP that was coded with the
intention of showing how an integrated LLM could interact with a Linux
system. There is a need to build a more robust system now and I would
like your assistance in a workflow which: 1) replaces all the sudo stuff
with python os and related functions. The need is eventually to have the
user (using the lady linux gui interface) ask things like, 'can you tell 
me what my settings are for my firewall', and for the system to query
settings like ufw or other firewall services which might be available to
the system. The data (as either a file, or parsed into JSON for example)
then is passed to the LLM for consideration. The first pass of the system
will not ask the LLM to update any files, but that feature is already being
considered by the team, but with definite human in the loop controls.
I am most interested in developing a simple workflow which the group can
understand/follow to refactor the functions in api_layer into individual .py
files that connect to the templates/firewall, /os, and /users.
```

### **Recommendations**

via >ask Claude GitHub Copilot Chat

- **Part 1** Plan the Modular Structure:

  - Divide the functionality into separate modules based on their purpose (e.g., firewall, os, users). 
  - Each module should handle a specific set of related tasks (e.g., firewall.py for firewall-related operations).

- **Part 2** Create a Directory Structure:

  - Organize the project into directories for better maintainability. For example:

``` plaintext
     project/
     ├── api_layer/
     │   ├── __init__.py
     │   ├── firewall.py
     │   ├── os.py
     │   ├── users.py
     ├── templates/
     │   ├── firewall.html
     │   ├── os.html
     │   ├── users.html
     ├── static/
     ├── main.py
     └── requirements.txt
 ```

- **Part 3** Refactor Functions into Modules:

    - Move related functions into their respective modules.

        - firewall.py: get_firewall_status_json, get_firewall_status, and any firewall-related endpoints.
        - os.py: Functions related to operating system queries.
        - users.py: Functions related to user management.

- **Part 4** Replace sudo Commands:

- Replace subprocess.run calls with Python's os or shutil modules where possible. 
- For example, use os.listdir, os.stat, or os.system for file and system operations. 
- For firewall settings, use libraries like pyufw or directly parse configuration files (e.g., /etc/ufw/).
  
- **Part 4** Create a Centralized API Layer:

- Use main.py to initialize the FastAPI app and include routers from the individual modules.
- Example:

``` python 
       from fastapi import FastAPI
       from api_layer import firewall, os, users

       app = FastAPI()

       app.include_router(firewall.router, prefix="/firewall", tags=["firewall"])
       app.include_router(os.router, prefix="/os", tags=["os"])
       app.include_router(users.router, prefix="/users", tags=["users"])
```

- **Part 5** Refactor Endpoints:

- Move each endpoint to its respective module and use FastAPI's APIRouter to define routes. 
- Example for firewall.py:

``` python 
     from fastapi import APIRouter, Request
     from fastapi.responses import PlainTextResponse
     import json
     import os

     router = APIRouter()

     @router.get("/")
     async def firewall_page(request: Request):
         return {"message": "Firewall page"}

     @router.post("/status")
     async def get_firewall_status():
         # Replace subprocess with os or a library like pyufw
         try:
             with os.popen("ufw status verbose") as stream:
                 output = stream.read()
             return {"status": output}
         except Exception as e:
             return PlainTextResponse(content=f"Error: {str(e)}")
```

**Part 6** Update Templates:

- Ensure the templates in the templates/ directory match the new modular structure. 
- Update the url_for calls in the templates to match the new routes.

**Part 7** Test the Refactored Code:
- Write unit tests for each module to ensure the functionality is preserved. 
- Use FastAPI's TestClient to test the API endpoints.

**Part 8** Document the Workflow:

- Document the Workflow:
- Create a README.md file to document the new structure and how to add new modules or endpoints.

**Part 9** Version Control:

- Use git to track changes. Use git log to review the history and git show to inspect specific commits.
