/* global fbq, ga, moment */

(function () {

    angular
        .module("app.bookings")
        .controller("BookingPaymentController", BookingPaymentController);

    function BookingPaymentController($q,
                                    $rootScope,
                                    $scope,
                                    $state,
                                    $stateParams,
                                    $translate,
                                    $window,
                                    BookingService,
                                    CardService,
                                    ContentService,
                                    finance,
                                    KycService,
                                    loggerToServer,
                                    ListingCategoryService,
                                    ListingService,
                                    ListingTypeService,
                                    mangopay,
                                    map,
                                    MediaService,
                                    MessageService,
                                    platform,
                                    pricing,
                                    Restangular,
                                    toastr,
                                    tools,
                                    StelaceConfig,
                                    StelaceEvent,
                                    User,
                                    UserService,
                                    usSpinnerService) {
        var listeners = [];
        var debouncedAction = tools.debounceAction(_createPayment);

        var nbTimeUnits = 28;
        var currentUser;
        var bookingPaymentMessages;
        var cardId;
        var stelaceEventObj;
        var kyc;
        var stripeCardElement;

        var stlConfig = StelaceConfig.getConfig();

        var vm = this;
        vm.listingType          = null;
        vm.listingTypeProperties = {};
        vm.userType             = null;
        vm.booking              = null;
        vm.showEmail            = false;
        vm.cardErrorType        = null;
        vm.stripeCardTouched    = false;
        vm.newCard              = {};
        vm.reuseCard            = true; // default
        vm.rememberCard         = true; // default
        vm.promptPhoneHighlight = false;
        vm.isSmsActive          = StelaceConfig.isFeatureActive('SMS');
        vm.thisYear             = moment().year();
        vm.thisMonth            = moment().month() + 1;
        vm.showPromptPhone      = vm.isSmsActive && _.includes(['show', 'require'], stlConfig.phone_prompt__taker_level);
        vm.isPhoneRequired      = vm.isSmsActive && stlConfig.phone_prompt__taker_level === 'require';
        vm.nationalityChanged   = false;
        vm.showUserTypeSwitch   = false;
        vm.info = {
            firstname: null,
            lastname: null,
            email: null,
            birthday: null,
            nationality: null,
            countryOfResidence: null,
            organizationName: null,
            organizationType: null,
            organizationEmail: null,
        };
        vm.requiredInfo = {
            firstname: false,
            lastname: false,
            email: false,
            birthday: false,
            nationality: false,
            countryOfResidence: false,
            organizationName: false,
            organizationType: false,
            organizationEmail: false,
        };

        vm.footerTestimonials   = true;

        vm.cardsToggle   = cardsToggle;
        vm.createAccount = createAccount;
        vm.saveCard      = saveCard;
        vm.createPayment = createPayment;
        vm.onChangeUserType = onChangeUserType;
        vm.onChangeBirthday = onChangeBirthday;
        vm.onChangeCountry = onChangeCountry;
        vm.onChangeNationality = onChangeNationality;

        activate();



        function activate() {
            if (! $stateParams.id) {
                return $state.go("inbox");
            }

            StelaceEvent.sendScrollEvent("Booking payment view")
                .then(function (obj) {
                    stelaceEventObj = obj;
                    listeners.push(function () {
                        stelaceEventObj.cancelScroll();
                        stelaceEventObj = null;
                    });
                });

            $rootScope.noGamificationDistraction = true; // Prevent gamification popover/animation distraction

            $scope.$on('$destroy', function () {
                _.forEach(listeners, function (listener) {
                    listener();
                });
                $rootScope.noGamificationDistraction = false;
            });

            var notFoundBooking = function (err) {
                loggerToServer.error(err); // Fail silently

                if (err.status === 404) {
                    $state.go("inbox");
                    return $q.reject("stop");
                } else {
                    return $q.reject(err);
                }
            };

            $q.all({
                booking: BookingService.get($stateParams.id).catch(notFoundBooking),
                currentUser: UserService.getCurrentUser(true),
                cards: CardService.getMine(),
                myImage: MediaService.getMyImage(),
                bookingPaymentMessages: MessageService.getBookingPaymentMessageTmp($stateParams.id),
                kyc: KycService.getMine(),
            }).then(function (results) {
                currentUser            = results.currentUser;
                bookingPaymentMessages = results.bookingPaymentMessages || {};
                cardId                 = results.cardId;
                kyc                    = results.kyc;

                if (currentUser.id !== results.booking.takerId) {
                    $state.go("listing", { slug: results.booking.listingId });
                    return $q.reject("User is not taker");
                }

                return tools.getLocalData("cardId", currentUser.id)
                    .then(function (cardId) {
                        results.cardId = cardId;
                        return results;
                    });
            }).then(function (results) {
                cardId = results.cardId;
                vm.booking       = results.booking;
                vm.currentUser   = currentUser;
                vm.cards         = _.filter(results.cards, function (card) {
                    return card.paymentProvider === vm.booking.paymentProvider;
                });
                vm.noImage       = (results.myImage.url === platform.getDefaultProfileImageUrl());

                vm.userType = vm.currentUser.userType || 'individual';

                vm.showUserTypeSwitch = !stlConfig.is_internal_service && vm.booking.paymentProvider === 'mangopay';

                setInfo(kyc);
                setRequiredInfo();

                if (vm.booking.cancellationId) {
                    ContentService.showNotification({ messageKey: 'pages.booking_payment.cancelled_booking' });
                    $state.go("inbox");
                    return $q.reject("stop");
                }

                if (! _.isEmpty(bookingPaymentMessages)) {
                    vm.privateContent = bookingPaymentMessages.privateContent;
                    vm.publicContent  = bookingPaymentMessages.publicContent;
                }

                if (vm.cards.length) {
                    var foundCard = (cardId && _.find(vm.cards, function (card) { return card.id === cardId; }));
                    if (foundCard) {
                        vm.selectedCard = foundCard;
                    } else {
                        vm.selectedCard = vm.cards[0];
                    }
                }

                if (vm.booking.paymentProvider === 'stripe') {
                    var eventCallback = function (error) {
                        vm.stripeCardTouched = true;
                        if (error) {
                            vm.cardErrorType = error.code;
                            vm.cardErrorMessage = error.message;
                        } else {
                            vm.cardErrorType = null;
                            vm.cardErrorMessage = null;
                        }
                        $scope.$digest();
                    };

                    stripeCardElement = CardService.getStripeCardElement({
                        el: '#card-element',
                        eventCallback: eventCallback
                    });
                }

                vm.existingPhone = vm.currentUser.phoneCheck; // save initial value

                vm.listingType = vm.booking.listingType;
                vm.listingTypeProperties = ListingTypeService.getProperties(vm.booking.listingType);

                if (vm.booking.startDate && vm.booking.endDate) {
                    vm.startDate = vm.booking.startDate;
                    vm.endDate   = moment(vm.booking.endDate).subtract({ d: 1 }).toISOString();
                }

                vm.adultPaymentTooltip = $translate.instant('pages.booking_payment.only_adult_payment_label');
                vm.paymentSecuredByTooltip = $translate.instant('pages.booking_payment.card.payment_secured_by');

                return $q.all({
                    conversations: MessageService.getConversations({
                        listingId: vm.booking.listingId,
                        senderId: currentUser.id
                    }),
                    listing: ListingService.get(vm.booking.listingId).catch(redirectToNotFoundListing),
                    listingLocations: ListingService.getLocations(vm.booking.listingId).catch(function () { return []; })
                });
            }).then(function (results) {
                var listing = results.listing;

                if (results.conversations.length) {
                    // pick conversation created last
                    var conversations = _.sortBy(results.conversations, function (conversation) {
                        return - conversation.createdDate;
                    });
                    vm.conversation = conversations[0];
                }
                ListingService.populate(listing, {
                    locations: results.listingLocations,
                    nbTimeUnits: Math.max(nbTimeUnits, vm.booking.nbTimeUnits)
                });

                vm.expirationYears = _.range(vm.thisYear, (vm.thisYear + 10));

                // Google Analytics event
                var gaLabel = 'bookingId: ' + vm.booking.id;
                ga('send', 'event', 'Listings', 'PaymentView', gaLabel);

                // Stelace event
                if (stelaceEventObj && stelaceEventObj.stelaceEvent) {
                    stelaceEventObj.stelaceEvent.update({
                        data: {
                            listingId: listing.id,
                            tagsIds: listing.tags,
                            bookingId: vm.booking.id
                        }
                    });
                }

                listing.owner.fullname = User.getFullname.call(listing.owner);
                vm.listing             = listing;

                vm.listingLocations = listing.vLocations;

                _.forEach(vm.listingLocations, function (location) {
                    location.displayAddress = map.getPlaceName(location);
                });

                vm.listingCategoryName = ListingCategoryService.findListingCategory(listing/*,listingCategories*/); // can be empty if listing-view was by-passed
                vm.notCategoryTags     = ListingCategoryService.notCategoryTags(listing.completeTags, vm.listingCategoryName);

                // $timeout(function () {
                //     vm.hideSummary = false; // for collapse
                // }, 500);
            })
            .catch(function (err) {
                if (err !== "stop") {
                    ContentService.showError(err);
                }
            });
        }

        function redirectToNotFoundListing(err) {
            if (err.status === 404) {
                $state.go("listing", { slug: vm.booking.listingId });
                return $q.reject("stop");
            }
        }

        function cardsToggle() {
            vm.reuseCard = !vm.reuseCard;
            vm.selectedCard = vm.reuseCard ? vm.cards[0] : null;
        }

        function onChangeUserType() {
            setRequiredInfo();
            vm.showEmail = shouldShowEmail();
        }

        function setRequiredInfo() {
            if (vm.booking.paymentProvider === 'stripe') {
                vm.requiredInfo = {
                    firstname: true,
                    lastname: true,
                    email: true,
                    birthday: false,
                    nationality: false,
                    countryOfResidence: false,
                    organizationName: vm.userType === 'organization',
                    organizationType: false,
                    organizationEmail: false
                };
            } else { // vm.booking.paymentProvider === 'mangopay'
                if (vm.userType === 'individual') {
                    vm.requiredInfo = {
                        firstname: true,
                        lastname: true,
                        email: true,
                        birthday: true,
                        nationality: true,
                        countryOfResidence: true,
                        organizationName: false,
                        organizationType: false,
                        organizationEmail: false
                    };
                } else {
                    vm.requiredInfo = {
                        firstname: true,
                        lastname: true,
                        email: false,
                        birthday: true,
                        nationality: true,
                        countryOfResidence: true,
                        organizationName: true,
                        organizationType: true,
                        organizationEmail: true
                    };
                }
            }
        }

        function setInfo(kyc) {
            if (vm.booking.paymentProvider === 'stripe') {
                vm.info = {
                    firstname: vm.currentUser.firstname,
                    lastname: vm.currentUser.lastname,
                    email: vm.currentUser.email,
                    birthday: null,
                    nationality: null,
                    countryOfResidence: null,
                    organizationName: vm.currentUser.organizationName,
                    organizationType: null,
                    organizationEmail: null,
                };
            } else {
                if (vm.userType === 'individual') {
                    vm.info = {
                        firstname: vm.currentUser.firstname,
                        lastname: vm.currentUser.lastname,
                        email: vm.currentUser.email,
                        birthday: kyc.data.birthday,
                        nationality: kyc.data.nationality,
                        countryOfResidence: kyc.data.countryOfResidence,
                        organizationName: null,
                        organizationType: null,
                        organizationEmail: null,
                    };
                } else { // vm.userType === 'organization'
                    vm.info = {
                        firstname: kyc.data.legalRepresentativeFirstname,
                        lastname: kyc.data.legalRepresentativeLastname,
                        email: null,
                        birthday: kyc.data.legalRepresentativeBirthday,
                        nationality: kyc.data.legalRepresentativeNationality,
                        countryOfResidence: kyc.data.legalRepresentativeCountryOfResidence,
                        organizationName: vm.currentUser.organizationName,
                        organizationType: kyc.data.legalPersonType,
                        organizationEmail: kyc.data.organizationEmail
                    };
                }
            }

            vm.showEmail = shouldShowEmail();
        }

        function shouldShowEmail() {
            if (vm.userType === 'organization') {
                return false;
            }

            return !vm.currentUser.email;
        }

        function checkRequiredInfo() {
            var allValid = true;

            if (vm.requiredInfo.firstname) {
                allValid = allValid && !!vm.info.firstname;
            }
            if (vm.requiredInfo.lastname) {
                allValid = allValid && !!vm.info.lastname;
            }
            if (vm.requiredInfo.email) {
                allValid = allValid && !!vm.info.email;
            }
            if (vm.requiredInfo.birthday) {
                allValid = allValid && !!vm.info.birthday;
            }
            if (vm.requiredInfo.nationality) {
                allValid = allValid && !!vm.info.nationality;
            }
            if (vm.requiredInfo.countryOfResidence) {
                allValid = allValid && !!vm.info.countryOfResidence;
            }
            if (vm.requiredInfo.organizationName) {
                allValid = allValid && !!vm.info.organizationName;
            }
            if (vm.requiredInfo.organizationType) {
                allValid = allValid && !!vm.info.organizationType;
            }
            if (vm.requiredInfo.organizationEmail) {
                allValid = allValid && !!vm.info.organizationEmail;
            }

            return allValid;
        }

        function onChangeBirthday(date) {
            vm.info.birthday = date;
        }

        function onChangeCountry() {
            if (vm.nationalityChanged) return;
            vm.info.nationality = vm.info.countryOfResidence;
        }

        function onChangeNationality() {
            vm.nationalityChanged = true;
        }

        function getUpdatedInfo() {
            var editingCurrentUser = Restangular.copy(vm.currentUser);
            var kycAttrs = {};

            if (vm.booking.paymentProvider === 'stripe') {
                if (vm.info.firstname) {
                    editingCurrentUser.firstname = vm.info.firstname;
                }
                if (vm.info.lastname) {
                    editingCurrentUser.lastname = vm.info.lastname;
                }
                if (vm.info.email) {
                    editingCurrentUser.email = vm.info.email;
                }
                if (vm.info.organizationName) {
                    editingCurrentUser.organizationName = vm.info.organizationName;
                }
            } else {
                if (vm.userType === 'individual') {
                    if (vm.info.firstname) {
                        editingCurrentUser.firstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        editingCurrentUser.lastname = vm.info.lastname;
                    }
                    if (vm.info.email) {
                        editingCurrentUser.email = vm.info.email;
                    }
                    kycAttrs.birthday = vm.info.birthday;
                    kycAttrs.nationality = vm.info.nationality;
                    kycAttrs.countryOfResidence = vm.info.countryOfResidence;
                } else {
                    if (vm.info.firstname) {
                        kycAttrs.legalRepresentativeFirstname = vm.info.firstname;
                    }
                    if (vm.info.lastname) {
                        kycAttrs.legalRepresentativeLastname = vm.info.lastname;
                    }
                    if (vm.info.organizationName) {
                        editingCurrentUser.organizationName = vm.info.organizationName;
                    }
                    kycAttrs.legalRepresentativeBirthday = vm.info.birthday;
                    kycAttrs.legalRepresentativeNationality = vm.info.nationality;
                    kycAttrs.legalRepresentativeCountryOfResidence = vm.info.countryOfResidence;
                    kycAttrs.legalPersonType = vm.info.organizationType;
                    kycAttrs.organizationEmail = vm.info.organizationEmail;
                }

                editingCurrentUser.userType = vm.userType || editingCurrentUser.userType;
            }

            return {
                editingCurrentUser: editingCurrentUser,
                kycAttrs: kycAttrs
            };
        }

        function createAccount() {
            var validBirthday    = ! isNaN(new Date(vm.info.birthday));

            var isAllInfoProvided = checkRequiredInfo();

            // Check if all needed info was provided
            if (!isAllInfoProvided) {
                ContentService.showNotification({
                    titleKey: 'pages.booking_payment.billing_information_title',
                    messageKey: 'form.missing_information'
                });
                return false;
            }
            if (vm.requiredInfo.birthday && ! validBirthday) {
                var dateOfBirthError = new Error("Invalid date of birth during checkout");
                // Should not happen since constructed above
                // Try failing silently but payment provider likely to issue an error.
                loggerToServer.error(dateOfBirthError);
            }

            var updatedInfo = getUpdatedInfo();
            var editingCurrentUser = updatedInfo.editingCurrentUser;
            var kycAttrs = updatedInfo.kycAttrs;

            return $q.when(true)
                .then(function () {
                    var updateAttrs = [
                        "firstname",
                        "lastname",
                        "userType",
                        "organizationName"
                    ];

                    var shouldUpdateUser = ! _.isEqual(_.pick(editingCurrentUser, updateAttrs), _.pick(vm.currentUser, updateAttrs));

                    if (shouldUpdateUser) {
                        return editingCurrentUser.patch().then(function (user) {
                            _.assign(vm.currentUser, _.pick(user, updateAttrs));
                            return user;
                        });
                    }
                    return $q.when(true);
                })
                .then(function () {
                    return KycService.updateKyc(kyc, kycAttrs);
                })
                .then(function (newKyc) {
                    kyc = newKyc;

                    // will not create an account if there is existing ones
                    return finance.createAccount({
                        accountType: 'customer',
                        paymentProvider: vm.booking.paymentProvider
                    })
                    .then(function (user) {
                        vm.currentUser.canChangeUserType = user.canChangeUserType;
                    });
                });
        }

        function saveCard() {
            return $q.resolve()
                .then(function () {
                    if (vm.booking.paymentProvider === 'mangopay') {
                        return _saveMangopayCard();
                    } else if (vm.booking.paymentProvider === 'stripe') {
                        return _saveStripeCard();
                    } else {
                        return $q.reject('Unknown payment provider');
                    }
                })
                .then(function (card) {
                    vm.cards.push(card);
                    return card;
                });
        }

        function _saveMangopayCard() {
            var cardRegistration;
            vm.newCard.expirationDate = "" + vm.cardExpirationMonth + vm.cardExpirationYear.toString().slice(2, 4);

            return CardService.createCardRegistration({ cardType: "CB_VISA_MASTERCARD" }) // TODO: use angular-credit-cards to detect card-type
                .then(function (c) {
                    cardRegistration = c;
                    mangopay.cardRegistration.init(cardRegistration);
                    return mangopay.cardRegistration.registerCard({
                        cardType: cardRegistration.cardType,
                        cardNumber: vm.newCard.number,
                        cardExpirationDate: vm.newCard.expirationDate,
                        cardCvx: vm.newCard.cvx
                    });
                })
                .then(function (data) {
                    return CardService.createCard({
                        cardRegistrationId: cardRegistration.id,
                        registrationData: data,
                        cardNumber: vm.newCard.number,
                        expirationDate: vm.newCard.expirationDate,
                        forget: ! vm.rememberCard,
                        paymentProvider: vm.booking.paymentProvider
                    });
                });
        }

        function _saveStripeCard() {
            if (vm.cardErrorType) {
                return $q.reject('Invalid card');
            }

            return CardService.createStripeCardSource(stripeCardElement)
                .then(function (res) {
                    return CardService.createCard({
                        sourceId: res.source.id,
                        paymentProvider: vm.booking.paymentProvider
                    });
                });
        }

        function createPayment() {
            return debouncedAction.process();
        }

        function _createPayment() {
            var selectedCard;

            // Register all payment attemps in Google Analytics
            var gaLabel = 'bookingId: ' + vm.booking.id;
            ga('send', 'event', 'Listings', 'PaymentAttempt', gaLabel);

            // Facebook event
            var fbEventParams = {
                content_ids: [vm.listing.id],
                content_name: vm.listing.name,
                content_category: ListingCategoryService.getCategoriesString(vm.listingCategoryName, vm.notCategoryTags[0]),
                stl_transaction_type: BookingService.getFbTransactionType(vm.booking)
            };
            fbq('track', 'AddPaymentInfo', fbEventParams);

            // Stelace event
            StelaceEvent.sendEvent("Booking payment attempt", {
                type: "click",
                data: {
                    listingId: vm.listing.id,
                    tagsIds: vm.listing.tags,
                    targetUserId: vm.booking.ownerId,
                    bookingId: vm.booking.id
                }
            });

            if (! vm.privateContent && (! vm.conversation || ! vm.booking.acceptedDate)) {
                // Automatic message for clarity, or when user has already booked this listing before, or engaged a conversation with owner
                // But don't create automatic message if already accepted by owner.
                vm.privateContent = $translate.instant('pages.booking_payment.default_private_message', {
                    price: vm.booking.takerPrice
                });
            }

            // Existing cards should be valid
            // TODO : check it
            if (vm.selectedCard && vm.reuseCard) {
                selectedCard = vm.selectedCard;
            } else if (! vm.selectedCard && vm.cards.length && vm.reuseCard) {
                selectedCard = vm.cards[0]; // should not happen
            } else {
                if (vm.booking.paymentProvider === 'stripe') {
                    if (!vm.stripeCardTouched) {
                        return ContentService.showNotification({
                            messageKey: 'payment.error.invalid_card_number'
                        });
                    }
                    if (vm.cardErrorType) {
                        return ContentService.showNotification({
                            messageKey: 'payment.error.invalid_card_number'
                        });
                    }
                } else { // vm.booking.paymentProvider === 'mangopay'
                    if ($scope.paymentForm.newCardNumber.$invalid) {
                        return ContentService.showNotification({
                            messageKey: 'payment.error.invalid_card_number'
                        });
                    }
                    if (! vm.cardExpirationMonth || ! vm.cardExpirationYear) {
                        return ContentService.showNotification({
                            messageKey: 'payment.error.invalid_card_expiration_date'
                        });
                    }
                    if ($scope.paymentForm.newCardCvc.$invalid) {
                        return ContentService.showNotification({
                            messageKey: 'payment.error.invalid_card_cvc'
                        });
                    }
                }
            }

            usSpinnerService.spin('payment-spinner');

            return $q.when(true)
                .then(function () {
                    return UserService.getCurrentUser(true);
                })
                .then(function (currentUser) {
                    vm.currentUser = currentUser;

                    if (! vm.currentUser.phoneCheck && vm.isPhoneRequired) {
                        vm.promptPhoneHighlight = true;
                        ContentService.showNotification({
                            messageKey: 'authentication.error.invalid_phone'
                        });
                        return $q.reject("stop");
                    }

                    if (! currentUser.email && ! tools.isEmail(vm.email)) {
                        ContentService.showNotification({
                            messageKey: 'authentication.error.invalid_email'
                        });
                        return $q.reject("stop");
                    }

                    if (! currentUser.email) {
                        return currentUser.updateEmail(vm.email);
                    } else {
                        return;
                    }
                })
                .then(function () {
                    return createAccount();
                })
                .then(function (hasAccount) {
                    if (hasAccount === false) {
                        return $q.reject("no account");
                    }

                    if (selectedCard && selectedCard.id) {
                        return selectedCard;
                    }
                    return saveCard();
                })
                .then(function (card) {
                    if (! selectedCard) {
                        selectedCard = card;
                    }

                    return tools.setLocalData("cardId", currentUser.id, card.id);
                })
                .then(function () {
                    var messages = vm.privateContent || vm.publicContent ? {
                        privateContent: vm.privateContent,
                        publicContent: vm.publicContent
                    } : {};

                    return MessageService.setBookingPaymentMessageTmp(vm.booking.id, messages);
                })
                .then(function () {
                    if (vm.booking.depositDate) {
                        $state.go("bookingConfirmation", { id: vm.booking.id });
                        return;
                    }

                    return vm.booking.payment({
                        cardId: selectedCard.id,
                        operation: "deposit-payment",
                        userMessage: {
                            privateContent: vm.privateContent,
                            publicContent: vm.publicContent
                        }
                    });
                })
                .then(function (mangopayRes) {
                    if (mangopayRes) {
                        if (mangopayRes.redirectURL) {
                            $window.location.href = mangopayRes.redirectURL;
                        } else {
                            $state.go("bookingConfirmation", { id: vm.booking.id });
                        }
                    }
                })
                .catch(function (err) {
                    if (err === "stop" || err === "no account") {
                        return; // already a toastr in createAccount
                    }

                    vm.reuseCard    = false;
                    vm.selectedCard = null;

                    var messageKey;

                    if (err.status === 400 && err.data && err.data.errorType === 'expiration_date_too_short') {
                        // TODO : check on load
                        return ContentService.showNotification({
                            messageKey: 'payment.error.card_expiration_too_short',
                            type: 'warning'
                        });
                    } else if (err.resultCode) {
                        var errorType = BookingService.getMangopayErrorType(err.resultCode);
                        messageKey = BookingService.mapErrorTypeToTranslationKey(errorType);

                        return ContentService.showNotification({
                            titleKey: 'payment.error.payment_error_title',
                            messageKey: messageKey,
                            type: 'error'
                        });
                    } else if (err.data) {
                        var paymentErrorTypes = BookingService.getPaymentErrorTypes();

                        if (err.data.errorType && _.includes(paymentErrorTypes, err.data.errorType)) {
                            messageKey = BookingService.mapErrorTypeToTranslationKey(err.data.errorType);

                            return ContentService.showNotification({
                                titleKey: 'payment.error.payment_error_title',
                                messageKey: messageKey,
                                type: 'error'
                            });
                        }
                    }

                    ContentService.showError(err);
                })
                .finally(function () {
                    usSpinnerService.stop('payment-spinner');
                });
        }
    }

})();
