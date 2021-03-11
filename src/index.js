require("dotenv").config();

const express = require("express");
const bodyParser = require("body-parser");
const debug = require("debug")("slash-command-template:index");
const app = express();

const cron = require("node-cron");
const { formatToTimeZone } = require("date-fns-timezone");

const standupconfig = require("./standupConfig");
const signature = require("./verifySignature");
const api = require("./api");
const payloads = require("./payloads");
const { filePaths } = require("./constants");
const { readData } = require("./utils/fileWrite");
const { formatConfiguredTime } = require("./utils/time");

const cronLogic = () => {
    readData(filePaths.standupConfig)
        .then((data) => {
            const timeZone = data.clientTimeZone;
            const currentDate = new Date();
            const currentWeekday = formatToTimeZone(currentDate, "dddd", {
                timeZone,
            });
            const currentTime = formatToTimeZone(currentDate, "HH:mm", {
                timeZone,
            });
            const daysPicker = data.days_picker_block.days_picker;
            const reminderHour =
                data.reminder_picker_block.reminder_time.selected_time;
            const reminderMinutes =
                data.reminder_minutes_block.reminder_time_minutes
                    .selected_option.value;
            const reminderTime = formatConfiguredTime(
                reminderHour,
                reminderMinutes
            );
            const standupHour =
                data.standup_picker_block.standup_picker.selected_time;
            const standupMinutes =
                data.standup_minutes_picker_block.standup_minutes
                    .selected_option.value;
            const standupTime = formatConfiguredTime(
                standupHour,
                standupMinutes
            );

            //todo(rutenis): handle non configured minutes (null value)

            console.log({ standupHour });
            console.log({ standupMinutes });

            daysPicker.selected_options.map((option) => {
                if (currentWeekday.toLocaleLowerCase() === option.value) {
                    if (currentTime === reminderTime) {
                        console.log("it's reminder time");
                    }
                    if (currentTime === standupTime) {
                        console.log("it's standup time");
                    }
                }
            });
        })
        .catch((error) => {
            throw new Error("Error reading data: ", error);
        });
};

cron.schedule("* * * * *", () => {
    cronLogic();
});

/*
 * Parse application/x-www-form-urlencoded && application/json
 * Use body-parser's `verify` callback to export a parsed raw body
 * that you need to use to verify the signature
 */

const rawBodyBuffer = (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || "utf8");
    }
};

app.use(bodyParser.urlencoded({ verify: rawBodyBuffer, extended: true }));
app.use(bodyParser.json({ verify: rawBodyBuffer }));

app.get("/", (req, res) => {
    cronLogic();
    res.send(
        "<h2>The Slash Command and Dialog app is running</h2> <p>Follow the" +
            " instructions in the README to configure the Slack App and your environment variables.</p>"
    );
});

/*
 * Endpoint to receive /helpdesk slash command from Slack.
 * Checks verification token and opens a dialog to capture more info.
 */
app.post("/command", async (req, res) => {
    // Verify the signing secret
    if (!signature.isVerified(req)) {
        debug("Verification token mismatch");
        return res.status(404).send();
    }

    // extract the slash command text, and trigger ID from payload
    const { trigger_id } = req.body;

    // create the modal payload - includes the dialog structure, Slack API token,
    // and trigger ID
    let view = payloads.standupConfig({
        trigger_id,
    });

    let result = await api.callAPIMethod("views.open", view);

    debug("views.open: %o", result);
    return res.send("");
});

/*
 * Endpoint to receive the dialog submission. Checks the verification token
 * and creates a Helpdesk standupconfig
 */
app.post("/interactive", (req, res) => {
    // Verify the signing secret
    if (!signature.isVerified(req)) {
        debug("Verification token mismatch");
        return res.status(404).send();
    }
    const body = JSON.parse(req.body.payload);

    res.send("");
    standupconfig.create(body.user.id, body.view);
});

const server = app.listen(process.env.PORT || 5000, () => {
    console.log(
        "Express server listening on port %d in %s mode",
        server.address().port,
        app.settings.env
    );
});
