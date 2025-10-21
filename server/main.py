# import os
import uvicorn
from .api import app
from .config import  PORT

def run():
    # Write PID file
    # PID_FILE.write_text(str(os.getpid()))

    # try:
    uvicorn.run(app, host="127.0.0.1", port=PORT)
    # finally:
        # if PID_FILE.exists():
            # PID_FILE.unlink()
            #
    # print("hello from main!")

if __name__ == "__main__":
    run()

