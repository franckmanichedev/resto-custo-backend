module.exports = (req, res, next) => {
    if (!req.body || typeof req.body.payload !== 'string') {
        return next();
    }

    try {
        const parsedPayload = JSON.parse(req.body.payload);
        req.body = parsedPayload && typeof parsedPayload === 'object' ? parsedPayload : {};
        return next();
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: 'Le champ payload doit contenir un JSON valide'
        });
    }
};
